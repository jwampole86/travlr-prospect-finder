// Synced from ava-assistant. Do not edit here: change it there and run tools/sync-to-travlr.mjs.
import type { AvaBus } from './useAva';
import { newRequestId } from './useAva';
import { KNOWLEDGE, KNOWLEDGE_VERSION, MOCK_LEADS } from './mockData';
import { cancelSpeech, speak } from './speech';
import { BrainUnavailable, streamBriefing, streamConfirm, streamPrepare, streamTurn } from './brain';
import type { BrainLine, BrainMessage, SourceNote } from './brain';
import { runTour } from './tours';
import { parseCards } from './cards';
import type { ActionStatus, AvaCard, CardAction } from './cards';
import { topicId } from '../core/learning';
import type { LearnEvent } from '../core/learning';
import type { TourEnv } from './tours';
import { anchorExists, buildContext, toursForRole, visibleAnchors } from '../host/types';
import type { AvaHost, TourDefinition } from '../host/types';

export interface OrchestratorHooks {
  addMessage: (role: 'user' | 'ava' | 'system', text: string, sources?: SourceNote[], meta?: { rateable?: boolean; cards?: AvaCard[]; action?: { id: string; summary: string } }) => void;
  /** Progress of a change AVA prepared: awaiting approval, running, done, failed or cancelled. */
  onAction?: (id: string, status: ActionStatus) => void;
  /** What AVA is learning about this person: ids and counts only, never what was said. */
  onLearn?: (event: LearnEvent) => void;
  voiceReplies: () => boolean;
  /** Sentence being spoken right now (for captions), or null. */
  onCaption?: (sentence: string | null) => void;
}

interface PipeState { received: boolean; reasoningOpen: boolean; executed?: boolean; /** The prepared change whose outcome this stream reports. */ actionId?: string }

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
  // Everything AVA explains while guiding or teaching is also what she said in the conversation, so the model must remember it: a
  // follow-up like "what does that mean?" is about the last thing she pointed at. One tour's narration is kept as a single entry, so a
  // long tour cannot push the user's own question out of the model's short history.
  let narration: BrainMessage | null = null;
  const remember = (text: string) => {
    if (narration && history.at(-1) === narration) narration.content += ` ${text}`;
    else { narration = { role: 'assistant', content: `(While guiding the user) ${text}` }; history.push(narration); }
  };
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

  async function say(run: Run, text: string, sources?: SourceNote[], rateable = false, cards?: AvaCard[]) {
    if (run.cancelled) return;
    bus.emit('ava.answer.started', run.requestId);
    hooks.addMessage('ava', text, sources, { rateable, cards: cards?.length ? cards : undefined });
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
    remember(text);
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
      notify: (t) => { hooks.addMessage('system', t); remember(t); },
      cancelled: () => run.cancelled
    }).then((result) => {
      // Only authored tours say something about what the person has learned; the ad-hoc "this screen" walkthrough does not.
      if (def.id !== 'screen' && !def.id.startsWith('go-')) hooks.onLearn?.({ kind: result.status === 'completed' ? 'tour_completed' : 'tour_stopped', tourId: def.id });
    });
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
    if (host.getRoute() === page.route) hooks.onLearn?.({ kind: 'page_opened', page: page.id });
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
      hooks.addMessage('ava', 'I can create a follow-up for Hartwell Residence. Please confirm before I change anything.', undefined, { action: { id: actionId, summary: 'Create a follow-up for Hartwell Residence' } });
      const decision = await waitForDecision(run.requestId, actionId, run);
      if (decision === 'cancelled') return;
      hooks.onAction?.(actionId, decision === 'rejected' ? 'cancelled' : 'running');
      if (decision === 'rejected') return say(run, 'Okay, cancelled. Nothing was changed.');
      const ok = await runTool(run, 'followups.create', { mutating: true, outcome, completesTask: true });
      hooks.onAction?.(actionId, ok ? 'done' : 'failed');
      if (ok) hooks.onLearn?.({ kind: 'tool_used', tool: 'create_followup' });
      if (run.cancelled) return;
      if (ok) return say(run, 'Done. The backend confirmed the follow-up for Hartwell Residence.');
      return say(run, 'I could not complete that, so nothing was created. Want me to try again?');
    }

    if (leadIntent) {
      bus.emit('ava.reasoning.ended', run.requestId);
      const ok = await runTool(run, 'leads.search', { mutating: false, outcome, completesTask: false });
      if (ok) hooks.onLearn?.({ kind: 'tool_used', tool: 'search_leads' });
      if (run.cancelled) return;
      if (!ok) {
        return say(run, outcome === 'timeout' ? 'The lead search timed out. I can retry, or you can open Leads manually.' : 'The lead search failed. Please try again in a moment.');
      }
      const list = MOCK_LEADS.map((l) => `${l.name} (${l.score}, ${l.status})`).join('; ');
      const tour = anchorExists('lead-results') ? startTour(run, { ...screenTour(host, ['lead-results']), steps: [{ id: 'results', anchor: 'lead-results', say: 'Here they are on screen.' }] }) : Promise.resolve();
      await say(run, `Here are your highest-priority luxury leads: ${list}.`, [{ ...SAMPLE_NOTE, asOf: new Date().toISOString() }], true);
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
    if (hit) {
      hooks.onLearn?.({ kind: 'question', topic: topicId(hit.source) });
      return say(run, hit.answer, [{ kind: 'knowledge', label: 'Sample help content', live: false, version: KNOWLEDGE_VERSION, citations: [hit.source] }], true);
    }
    return say(run, "I don't have that in my approved AVYRO knowledge yet, so I won't guess. Try asking about lead verification, filtering, or partner onboarding.");
  }

  /** Plays one brain stream onto the event bus. Returns the confirmation the brain asked for, if any. */
  async function pipe(run: Run, source: AsyncGenerator<BrainLine>, tours: Promise<void>[], state: PipeState) {
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
            if (line.completesTask) { state.executed = true; if (state.actionId) hooks.onAction?.(state.actionId, 'done'); }
            hooks.onLearn?.({ kind: 'tool_used', tool: line.tool });
            bus.emit('ava.tool.succeeded', run.requestId, { tool: line.tool, callId: line.callId, backendConfirmed: line.backendConfirmed, completesTask: line.completesTask });
          } else if (line.reason === 'denied') {
            state.executed = false;
            if (state.actionId) hooks.onAction?.(state.actionId, 'failed');
            bus.emit('ava.permission.denied', run.requestId, { scope: 'tool', tool: line.tool, callId: line.callId });
          } else if (line.reason === 'timeout') {
            state.executed = false;
            if (state.actionId) hooks.onAction?.(state.actionId, 'failed');
            bus.emit('ava.tool.timed_out', run.requestId, { tool: line.tool, callId: line.callId });
          } else {
            state.executed = false;
            if (state.actionId) hooks.onAction?.(state.actionId, 'failed');
            bus.emit('ava.tool.failed', run.requestId, { tool: line.tool, callId: line.callId, reason: 'error' });
          }
          break;
        case 'denied':
          closeReasoning();
          bus.emit('ava.permission.denied', run.requestId, { scope: 'tool', tool: line.tool });
          break;
        case 'tour':
          closeReasoning();
          hooks.onLearn?.({ kind: 'tool_used', tool: 'show_on_screen' });
          tours.push(startTour(run, screenTour(host, line.anchors)));
          break;
        case 'go':
          closeReasoning();
          hooks.onLearn?.({ kind: 'tool_used', tool: 'go_to_page' });
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
          hooks.addMessage('ava', prompt, undefined, { action: { id: line.actionId, summary: line.summary } });
          history.push({ role: 'assistant', content: prompt });
          break;
        }
        case 'answer': {
          closeReasoning();
          const topic = topicId((line.sources ?? []).find((x) => x.kind === 'knowledge')?.citations?.[0]);
          hooks.onLearn?.({ kind: 'question', topic });
          await say(run, line.text, line.sources, true, parseCards(line.cards));
          break;
        }
        case 'error':
          if (line.code === 'llm_not_configured') throw new BrainUnavailable(line.code);
          if (line.code === 'unauthenticated') throw new BrainUnavailable('unauthorized');
          if (line.code === 'briefing_failed' || line.code === 'forbidden') throw new BrainUnavailable(line.code);
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

  /** Waits for the person's decision on a prepared change, then tells the server, which runs it (or discards it) exactly once. */
  async function settle(run: Run, confirmation: { actionId: string; summary: string }, tours: Promise<void>[], state: PipeState) {
    const decision = await waitForDecision(run.requestId, confirmation.actionId, run);
    if (decision === 'cancelled') { hooks.onAction?.(confirmation.actionId, 'cancelled'); return; }
    hooks.onAction?.(confirmation.actionId, decision === 'accepted' ? 'running' : 'cancelled');
    state.executed = undefined;
    state.actionId = confirmation.actionId;
    // Always tell the server, so a rejected action is discarded and an accepted one runs exactly once.
    await pipe(run, streamConfirm(host, confirmation.actionId, decision === 'accepted' ? 'accept' : 'reject', buildContext(host)), tours, state);
    if (decision === 'accepted' && state.executed !== true) hooks.onAction?.(confirmation.actionId, 'failed');
  }

  async function handleLive(run: Run) {
    const state: PipeState = { received: false, reasoningOpen: true };
    const tours: Promise<void>[] = [];
    bus.emit('ava.reasoning.started', run.requestId);
    try {
      const confirmation = await pipe(run, streamTurn(host, history, buildContext(host), run.abort.signal), tours, state);
      if (confirmation && !run.cancelled) await settle(run, confirmation, tours, state);
      await Promise.all(tours);
    } catch (err) {
      if (run.cancelled) return;
      if (err instanceof BrainUnavailable && !state.received) throw err;
      bus.emit('ava.reasoning.ended', run.requestId);
      await say(run, 'I could not reach my assistant service, so nothing was changed. Please try again.');
    }
  }

  /** A change chosen from an answer card: prepared by the server, approved by the person, run once, and its true outcome shown. */
  async function handlePrepared(run: Run, tool: string, args: Record<string, unknown>) {
    const state: PipeState = { received: false, reasoningOpen: true };
    const tours: Promise<void>[] = [];
    bus.emit('ava.reasoning.started', run.requestId);
    try {
      const confirmation = await pipe(run, streamPrepare(host, tool, args, buildContext(host)), tours, state);
      if (confirmation && !run.cancelled) await settle(run, confirmation, tours, state);
      else bus.emit('ava.reasoning.ended', run.requestId);
    } catch (err) {
      if (run.cancelled) return;
      bus.emit('ava.reasoning.ended', run.requestId);
      await say(run, err instanceof BrainUnavailable && err.reason === 'unauthorized'
        ? 'Your session has expired, so I can’t do that right now. Please sign in again. Nothing was changed.'
        : 'I could not reach my assistant service, so nothing was changed. Please try again.');
    }
  }

  /** The "what needs you today" summary. Automatic ones stay silent if anything is wrong; one the person asked for says so. */
  async function handleBriefing(run: Run, automatic: boolean): Promise<boolean> {
    const state: PipeState = { received: false, reasoningOpen: true };
    bus.emit('ava.reasoning.started', run.requestId);
    try {
      await pipe(run, streamBriefing(host, buildContext(host), run.abort.signal), [], state);
    } catch {
      if (run.cancelled) return false;
      bus.emit('ava.reasoning.ended', run.requestId);
      if (!automatic) await say(run, 'I could not get your briefing right now. Please try again in a moment.');
      return false;
    }
    if (state.reasoningOpen) bus.emit('ava.reasoning.ended', run.requestId);
    return !run.cancelled;
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
    /** What needs the person today. `automatic` is the once-a-day one on opening: no message from them, and silent on failure. */
    briefing(automatic = false): Promise<boolean> {
      stop('user');
      if (!automatic) {
        hooks.addMessage('user', 'Brief me');
        history.push({ role: 'user', content: 'Brief me on what needs my attention today.' });
      }
      const run: Run = { requestId: newRequestId(), cancelled: false, abort: new AbortController() };
      active = run;
      return handleBriefing(run, automatic).finally(() => { if (active === run) active = null; });
    },
    /** A button on an answer card. Opening and asking are harmless; anything that changes data is prepared, then approved by the person. */
    async cardAction(action: CardAction) {
      switch (action.kind) {
        case 'ask':
          return this.submit(action.text);
        case 'open_lead':
          if (host.openLead) host.openLead(action.leadId, action.focus);
          else hooks.addMessage('system', "I can't open that lead from here.");
          return;
        case 'open_page': {
          stop('user');
          const run: Run = { requestId: newRequestId(), cancelled: false, abort: new AbortController() };
          active = run;
          return void handleGo(run, action.page, true).finally(() => { if (active === run) active = null; });
        }
        case 'export': {
          if (!host.exportLeads) return void hooks.addMessage('system', "I can't export from here.");
          try {
            const n = await host.exportLeads();
            hooks.addMessage('system', n > 0 ? `Exported ${n} lead${n === 1 ? '' : 's'} as a CSV file.` : 'There is nothing to export with the current filters.');
          } catch {
            hooks.addMessage('system', 'The export did not complete. Nothing was downloaded.');
          }
          return;
        }
        case 'prepare': {
          stop('user');
          const run: Run = { requestId: newRequestId(), cancelled: false, abort: new AbortController() };
          active = run;
          return void handlePrepared(run, action.tool, action.args).finally(() => { if (active === run) active = null; });
        }
      }
    },
    stop,
    /** Request id of the run in progress, so UI controls can address it. */
    currentRequestId: () => active?.requestId ?? null
  };
}
