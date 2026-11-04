// Synced from ava-assistant. Do not edit here: change it there and run tools/sync-to-travlr.mjs.
import type { AvaBus } from './useAva';
import { newRequestId } from './useAva';
import { KNOWLEDGE, KNOWLEDGE_VERSION, MOCK_LEADS } from './mockData';
import { cancelSpeech, speak } from './speech';
import { BrainUnavailable, streamConfirm, streamTurn } from './brain';
import type { BrainLine, BrainMessage, SourceNote } from './brain';
import { runTour } from './tours';
import type { TourEnv } from './tours';
import { anchorExists, buildContext, toursForRole, visibleAnchors } from '../host/types';
import type { AvaHost, TourDefinition } from '../host/types';

export interface OrchestratorHooks {
  addMessage: (role: 'user' | 'ava' | 'system', text: string, sources?: SourceNote[]) => void;
  voiceReplies: () => boolean;
  /** Sentence being spoken right now (for captions), or null. */
  onCaption?: (sentence: string | null) => void;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const domEnv = (host: AvaHost): TourEnv => ({
  currentRoute: host.getRoute,
  navigate: host.navigate,
  hasAnchor: anchorExists,
  reveal: (id) => host.reveal?.(id),
  sleep,
  now: () => Date.now()
});

interface Run {
  requestId: string;
  cancelled: boolean;
  abort: AbortController;
}

const LEGACY_SAY: Record<string, string> = {
  filters: 'First, use the filters to narrow down the properties you care about.',
  'lead-results': 'Then review the results here, highest score first.',
  'followup-button': 'When you are ready, create a follow-up from here.'
};

/** A walkthrough of whatever anchors are on screen, for screens that have no authored tour. */
function screenTour(host: AvaHost, anchors: string[]): TourDefinition {
  return {
    id: 'screen',
    title: 'This screen',
    summary: 'A quick look at this screen',
    roles: ['admin', 'owner', 'agent', 'homeowner'],
    steps: anchors.map((anchor, i) => ({ id: `step_${i + 1}`, anchor, say: LEGACY_SAY[anchor] ?? `This is "${anchor}".` }))
  };
}

const tokenize = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2);

function pickTour(host: AvaHost, text: string): TourDefinition | null {
  const tours = toursForRole(host);
  const words = new Set(tokenize(text));
  let best: { tour: TourDefinition; score: number } | null = null;
  for (const tour of tours) {
    const hay = new Set([...tokenize(tour.title), ...tokenize(tour.id), ...(tour.keywords ?? []).flatMap(tokenize)]);
    const score = [...words].filter((w) => hay.has(w)).length;
    if (score > (best?.score ?? 0)) best = { tour, score };
  }
  return best?.tour ?? null;
}

/** The screen a request names, by the words in its title, id and hint. Requires at least one distinctive word to match. */
function pickPage(host: AvaHost, text: string) {
  const words = new Set(tokenize(text));
  let best: { page: NonNullable<AvaHost['pages']>[number]; score: number } | null = null;
  for (const page of host.pages ?? []) {
    const own = new Set([...tokenize(page.title), ...tokenize(page.id)]);
    const score = [...own].filter((w) => words.has(w)).length * 2 + [...new Set(tokenize(page.hint ?? ''))].filter((w) => words.has(w)).length * 0.5;
    if (score >= 2 && score > (best?.score ?? 0)) best = { page, score };
  }
  return best?.page ?? null;
}

/**
 * Drives one conversation turn. The live path streams the server brain (LLM + tool gateway, see server/);
 * when the brain is unreachable and the host allows it, it falls back to a clearly-labelled offline demo script.
 * Both paths emit the same bus events, and every visual state comes from those events, never from printed text.
 */
export function createOrchestrator(bus: AvaBus, host: AvaHost, hooks: OrchestratorHooks, env: TourEnv = domEnv(host)) {
  let active: Run | null = null;
  const history: BrainMessage[] = [];
  let offlineNoticeShown = false;

  function waitForDecision(requestId: string, actionId: string, run: Run): Promise<'accepted' | 'rejected' | 'cancelled'> {
    return new Promise((resolve) => {
      const off = bus.subscribe((e) => {
        if (e.type === 'ava.confirmation.accepted' && e.payload.actionId === actionId) finish('accepted');
        if (e.type === 'ava.confirmation.rejected' && e.payload.actionId === actionId) finish('rejected');
      });
      const poll = window.setInterval(() => run.cancelled && finish('cancelled'), 100);
      function finish(v: 'accepted' | 'rejected' | 'cancelled') {
        off();
        window.clearInterval(poll);
        resolve(v);
      }
    });
  }

  async function say(run: Run, text: string, sources?: SourceNote[]) {
    if (run.cancelled) return;
    bus.emit('ava.answer.started', run.requestId);
    hooks.addMessage('ava', text, sources);
    history.push({ role: 'assistant', content: text });
    if (hooks.voiceReplies()) await speak(bus, text, hooks.onCaption);
    else await sleep(Math.min(1200 + text.length * 22, 5000));
    if (!run.cancelled) bus.emit('ava.answer.ended', run.requestId);
  }

  /** Narrates a tour step without adding it to the model's conversation history. */
  async function narrate(run: Run, text: string) {
    if (run.cancelled) return;
    bus.emit('ava.answer.started', run.requestId);
    hooks.addMessage('ava', text);
    if (hooks.voiceReplies()) await speak(bus, text, hooks.onCaption);
    else await sleep(Math.min(1200 + text.length * 22, 4000));
    if (!run.cancelled) bus.emit('ava.answer.ended', run.requestId);
  }

  function startTour(run: Run, def: TourDefinition) {
    return runTour(def, {
      bus,
      env,
      requestId: run.requestId,
      say: (t) => narrate(run, t),
      notify: (t) => hooks.addMessage('system', t),
      cancelled: () => run.cancelled
    }).then(() => undefined);
  }

  /**
   * Takes the user to a screen: points at its item in the menu (opening the menu category first if needed), then opens it and,
   * if the screen has an authored tour, points at that tour's first element. AVA only points and navigates; she never clicks.
   */
  async function handleGo(run: Run, pageId: string, open: boolean) {
    const page = (host.pages ?? []).find((g) => g.id === pageId);
    if (!page) {
      hooks.addMessage('system', "That screen isn't available for your account.");
      return;
    }
    const anchor = `nav-${page.id}`;
    const here = host.getRoute() === page.route;
    if (!env.hasAnchor(anchor) && env.reveal) {
      env.reveal(anchor);
      await env.sleep(250);
    }
    const steps: TourDefinition['steps'] = [];
    if (env.hasAnchor(anchor)) {
      steps.push({ id: 'menu', anchor, say: open && !here ? `${page.title} is right here in the menu. I'll open it for you.` : `${page.title} is right here in the menu.` });
    }
    const authored = open ? toursForRole(host).find((t) => t.steps[0]?.route === page.route) : undefined;
    if (authored) steps.push({ ...authored.steps[0], route: page.route });

    if (!steps.length) {
      if (!open) return narrate(run, `${page.title} is in the menu, but I can't see it from here.`);
    } else {
      await startTour(run, { id: `go-${page.id}`, title: page.title, summary: page.title, roles: ['admin', 'owner', 'agent', 'homeowner'], steps });
    }
    if (run.cancelled || !open || authored || here) return;

    host.navigate(page.route);
    const end = Date.now() + 6000;
    while (host.getRoute() !== page.route && Date.now() < end && !run.cancelled) await sleep(100);
    if (run.cancelled) return;
    await narrate(run, host.getRoute() === page.route ? `Here's ${page.title}.` : `I couldn't open ${page.title} from here.`);
  }

  async function runTool(run: Run, tool: string, opts: { mutating: boolean; outcome: 'ok' | 'fail' | 'timeout'; completesTask: boolean }) {
    const callId = 'call_' + Math.random().toString(36).slice(2, 8);
    bus.emit('ava.tool.started', run.requestId, { tool, callId, mutating: opts.mutating, uiTarget: 'lead-results' });
    // The backend call always finishes (or fails) even if the user stops AVA; the event reflects that truth.
    await sleep(opts.outcome === 'timeout' ? 2600 : 1400);
    if (opts.outcome === 'timeout') bus.emit('ava.tool.timed_out', run.requestId, { tool, callId });
    else if (opts.outcome === 'fail') bus.emit('ava.tool.failed', run.requestId, { tool, callId, reason: 'error' });
    else
      bus.emit('ava.tool.succeeded', run.requestId, {
        tool,
        callId,
        backendConfirmed: true,
        completesTask: opts.completesTask
      });
    return opts.outcome === 'ok';
  }

  const SAMPLE_NOTE: SourceNote = { kind: 'leads', label: 'Built-in sample leads', live: false, count: MOCK_LEADS.length };

  async function handleOffline(run: Run, text: string) {
    const t = text.toLowerCase();
    const outcome: 'ok' | 'fail' | 'timeout' = /timeout|slow/.test(t) ? 'timeout' : /fail|error|broken/.test(t) ? 'fail' : 'ok';
    // "how does lead verification work?" is a help question, not a lead search.
    const leadIntent = /\b(find|search|list|show)\b.*\b(leads?|homeowners?)\b|\b(highest[- ]priority|top)\b.*\bleads?\b|\bmy leads\b|\bmy homeowners\b/.test(t);
    const followUpIntent = /(send|create|follow.?up|email|message|export)/.test(t);
    const needsLeads = followUpIntent || leadIntent;

    bus.emit('ava.reasoning.started', run.requestId);
    await sleep(900);
    if (run.cancelled) return;

    // Same rule as the server: a role without lead tools is refused, and the refusal is shown as a permission denial.
    if (needsLeads && host.role === 'homeowner') {
      bus.emit('ava.reasoning.ended', run.requestId);
      bus.emit('ava.permission.denied', run.requestId, { scope: 'tool', tool: 'leads' });
      return say(run, "Lead tools aren't available for your role, so I can't do that. I can still explain how AVYRO works or show you around.");
    }

    if (followUpIntent) {
      const actionId = 'act_' + run.requestId;
      bus.emit('ava.confirmation.required', run.requestId, {
        actionId,
        summary: 'Create a follow-up for Hartwell Residence'
      });
      hooks.addMessage('ava', 'I can create a follow-up for Hartwell Residence. Please confirm before I change anything.');
      const decision = await waitForDecision(run.requestId, actionId, run);
      if (decision === 'cancelled') return;
      if (decision === 'rejected') return say(run, 'Okay, cancelled. Nothing was changed.');
      const ok = await runTool(run, 'followups.create', { mutating: true, outcome, completesTask: true });
      if (run.cancelled) return;
      if (ok) return say(run, 'Done. The backend confirmed the follow-up for Hartwell Residence.');
      return say(run, 'I could not complete that, so nothing was created. Want me to try again?');
    }

    if (leadIntent) {
      bus.emit('ava.reasoning.ended', run.requestId);
      const ok = await runTool(run, 'leads.search', { mutating: false, outcome, completesTask: false });
      if (run.cancelled) return;
      if (!ok) {
        return say(run, outcome === 'timeout' ? 'The lead search timed out. I can retry, or you can open Leads manually.' : 'The lead search failed. Please try again in a moment.');
      }
      const list = MOCK_LEADS.map((l) => `${l.name} (${l.score}, ${l.status})`).join('; ');
      const tour = anchorExists('lead-results') ? startTour(run, { ...screenTour(host, ['lead-results']), steps: [{ id: 'results', anchor: 'lead-results', say: 'Here they are on screen.' }] }) : Promise.resolve();
      await say(run, `Here are your highest-priority luxury leads: ${list}.`, [{ ...SAMPLE_NOTE, asOf: new Date().toISOString() }]);
      await tour;
      return;
    }

    const pageHit = pickPage(host, t);
    if (pageHit && /(take me|go to|open|navigate|where|find|show me)/.test(t)) {
      bus.emit('ava.reasoning.ended', run.requestId);
      const asksWhere = /(where|find)/.test(t) && !/(take me|go to|open|navigate)/.test(t);
      await handleGo(run, pageHit.id, !asksWhere);
      return;
    }

    if (/(tour|show me|where|how do i|walk|around)/.test(t)) {
      bus.emit('ava.reasoning.ended', run.requestId);
      const authored = /missing/.test(t) ? null : pickTour(host, t) ?? (/(tour|walk|around)/.test(t) ? toursForRole(host)[0] ?? null : null);
      if (authored) {
        await say(run, `Let's take the "${authored.title}" tour.`);
        await startTour(run, authored);
        return;
      }
      const anchors = /missing/.test(t) ? ['filters', 'does-not-exist', 'followup-button'] : visibleAnchors();
      if (!anchors.length) return say(run, "I don't see anything on this screen that I can point at.");
      const tour = startTour(run, screenTour(host, anchors));
      await say(run, "Let me walk you through this screen.");
      await tour;
      return;
    }

    const hit = KNOWLEDGE.find((k) => k.keywords.some((w) => t.includes(w)));
    bus.emit('ava.reasoning.ended', run.requestId);
    if (hit) return say(run, hit.answer, [{ kind: 'knowledge', label: 'Sample help content', live: false, version: KNOWLEDGE_VERSION, citations: [hit.source] }]);
    return say(run, "I don't have that in my approved AVYRO knowledge yet, so I won't guess. Try asking about lead verification, filtering, or partner onboarding.");
  }

  /** Plays one brain stream onto the event bus. Returns the confirmation the brain asked for, if any. */
  async function pipe(run: Run, source: AsyncGenerator<BrainLine>, tours: Promise<void>[], state: { received: boolean; reasoningOpen: boolean }) {
    const closeReasoning = () => {
      if (state.reasoningOpen) {
        state.reasoningOpen = false;
        bus.emit('ava.reasoning.ended', run.requestId);
      }
    };
    let confirmation: { actionId: string; summary: string } | null = null;
    for await (const line of source) {
      state.received = true;
      switch (line.t) {
        case 'tool_start':
          closeReasoning();
          bus.emit('ava.tool.started', run.requestId, { tool: line.tool, callId: line.callId, mutating: line.mutating, uiTarget: line.uiTarget });
          break;
        case 'tool_end':
          if (line.ok) {
            bus.emit('ava.tool.succeeded', run.requestId, { tool: line.tool, callId: line.callId, backendConfirmed: line.backendConfirmed, completesTask: line.completesTask });
          } else if (line.reason === 'denied') {
            bus.emit('ava.permission.denied', run.requestId, { scope: 'tool', tool: line.tool, callId: line.callId });
          } else if (line.reason === 'timeout') {
            bus.emit('ava.tool.timed_out', run.requestId, { tool: line.tool, callId: line.callId });
          } else {
            bus.emit('ava.tool.failed', run.requestId, { tool: line.tool, callId: line.callId, reason: 'error' });
          }
          break;
        case 'denied':
          closeReasoning();
          bus.emit('ava.permission.denied', run.requestId, { scope: 'tool', tool: line.tool });
          break;
        case 'tour':
          closeReasoning();
          tours.push(startTour(run, screenTour(host, line.anchors)));
          break;
        case 'go':
          closeReasoning();
          tours.push(handleGo(run, line.page, line.open));
          break;
        case 'tour_start': {
          closeReasoning();
          const def = toursForRole(host).find((t) => t.id === line.tourId);
          if (def) tours.push(startTour(run, def));
          else hooks.addMessage('system', "That tour isn't available for your account.");
          break;
        }
        case 'confirm': {
          closeReasoning();
          confirmation = { actionId: line.actionId, summary: line.summary };
          bus.emit('ava.confirmation.required', run.requestId, { actionId: line.actionId, summary: line.summary });
          const prompt = `${line.summary}. Please confirm before I change anything.`;
          hooks.addMessage('ava', prompt);
          history.push({ role: 'assistant', content: prompt });
          break;
        }
        case 'answer':
          closeReasoning();
          await say(run, line.text, line.sources);
          break;
        case 'error':
          if (line.code === 'llm_not_configured') throw new BrainUnavailable(line.code);
          if (line.code === 'unauthenticated') throw new BrainUnavailable('unauthorized');
          closeReasoning();
          await say(run, line.code === 'llm_auth'
            ? 'My AI service rejected its access key, so I can only answer help-center questions right now. An admin needs to update AVA_LLM_API_KEY. Nothing was changed.'
            : line.code === 'llm_rate_limited' || line.code === 'llm_unavailable'
              ? 'My AI service is not responding right now, so I can only answer help-center questions. Please try again in a moment. Nothing was changed.'
              : 'Sorry, something went wrong on my side. Nothing was changed.');
          break;
        case 'done':
          break;
      }
    }
    return confirmation;
  }

  async function handleLive(run: Run) {
    const state = { received: false, reasoningOpen: true };
    const tours: Promise<void>[] = [];
    bus.emit('ava.reasoning.started', run.requestId);
    try {
      const confirmation = await pipe(run, streamTurn(host, history, buildContext(host), run.abort.signal), tours, state);
      if (confirmation && !run.cancelled) {
        const decision = await waitForDecision(run.requestId, confirmation.actionId, run);
        if (decision === 'cancelled') return;
        // Always tell the server, so a rejected action is discarded and an accepted one runs exactly once.
        await pipe(run, streamConfirm(host, confirmation.actionId, decision === 'accepted' ? 'accept' : 'reject', buildContext(host)), tours, state);
      }
      await Promise.all(tours);
    } catch (err) {
      if (run.cancelled) return;
      if (err instanceof BrainUnavailable && !state.received) throw err;
      bus.emit('ava.reasoning.ended', run.requestId);
      await say(run, 'I could not reach my assistant service, so nothing was changed. Please try again.');
    }
  }

  async function handle(run: Run, text: string) {
    try {
      await handleLive(run);
    } catch (err) {
      if (!(err instanceof BrainUnavailable)) throw err;
      bus.emit('ava.reasoning.ended', run.requestId);
      if (!host.offlineDemo) {
        const expired = err.reason === 'unauthorized';
        if (expired) bus.emit('ava.permission.denied', run.requestId, { scope: 'action' });
        return say(run, expired
          ? 'Your session has expired, so I can’t help right now. Please sign in again. Nothing was changed.'
          : 'My assistant service isn’t available right now, so I can’t help with that yet. Nothing was changed.');
      }
      if (!offlineNoticeShown) {
        offlineNoticeShown = true;
        hooks.addMessage('system', 'AVA is running its built-in demo script because the assistant service is not available. Start it with `npm run server` and set AVA_LLM_API_KEY for real answers.');
      }
      await handleOffline(run, text);
    }
  }

  function stop(source: 'user' | 'system' = 'user') {
    if (active) {
      const run = active;
      run.cancelled = true;
      run.abort.abort();
      cancelSpeech();
      hooks.onCaption?.(null);
      bus.emit('ava.interrupted', undefined, { source });
      const pending = bus.getState().confirmation;
      if (pending) bus.emit('ava.confirmation.rejected', pending.requestId, { actionId: pending.actionId });
      bus.emit('ava.reasoning.ended', run.requestId);
      bus.emit('ava.answer.ended', run.requestId);
      active = null;
    }
  }

  return {
    submit(text: string) {
      stop('user');
      hooks.addMessage('user', text);
      history.push({ role: 'user', content: text });
      const run: Run = { requestId: newRequestId(), cancelled: false, abort: new AbortController() };
      active = run;
      void handle(run, text).finally(() => {
        if (active === run) active = null;
      });
    },
    /** Starts an authored tour directly, e.g. from a suggestion chip. */
    startTourById(id: string) {
      const def = toursForRole(host).find((t) => t.id === id);
      if (!def) return false;
      stop('user');
      // Tapping a tour chip is the user asking for it, so it shows as their message just like a typed or spoken request.
      const asked = `Show me the ${def.title} tour`;
      hooks.addMessage('user', asked);
      history.push({ role: 'user', content: asked });
      const run: Run = { requestId: newRequestId(), cancelled: false, abort: new AbortController() };
      active = run;
      void (async () => {
        await say(run, `Let's take the "${def.title}" tour.`);
        await startTour(run, def);
      })().finally(() => { if (active === run) active = null; });
      return true;
    },
    stop,
    /** Request id of the run in progress, so UI controls can address it. */
    currentRequestId: () => active?.requestId ?? null
  };
}
