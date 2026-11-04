// Synced from ava-assistant. Do not edit here: change it there and run tools/sync-to-travlr.mjs.
import { useRef } from 'react';
import type { AvaBus, LogEntry } from '../runtime/useAva';
import { newRequestId } from '../runtime/useAva';
import type { AvaState, Presentation } from '../core/ava-state';
import { resolveClipIds } from '../core/ava-state';
import type { AvaRole } from '../host/types';

interface Props {
  bus: AvaBus;
  state: AvaState;
  presentation: Presentation;
  log: LogEntry[];
  turn: number;
  setTurn: (n: number) => void;
  role?: AvaRole | null;
  onRoleChange?: (role: AvaRole | null) => void;
}

/** Developer-only Animation Studio (spec v2 section 15): simulate every event and inspect the result. */
export function StudioPanel({ bus, state, presentation, log, turn, setTurn, role, onRoleChange }: Props) {
  const req = useRef(newRequestId());
  const call = useRef('call_demo');
  const r = () => req.current;
  const tool = { tool: 'leads.search', callId: call.current };

  const Btn = (label: string, fn: () => void) => (
    <button key={label} onClick={fn}>{label}</button>
  );
  const newReq = () => { req.current = newRequestId(); return req.current; };

  return (
    <aside className="studio">
      <h3>Animation Studio</h3>
      <div className="row">
        <label>Turntable {turn}°<input type="range" min={-180} max={180} value={turn} onChange={(e) => setTurn(+e.target.value)} /></label>
        <button onClick={() => setTurn(0)}>Front</button>
        <button onClick={() => setTurn(90)}>Side</button>
        <button onClick={() => setTurn(180)}>Back</button>
      </div>

      {onRoleChange && (
        <>
          <h4>Demo role</h4>
          <div className="row">
            <select aria-label="Demo role" value={role ?? ''} onChange={(e) => onRoleChange((e.target.value || null) as AvaRole | null)}>
              {['admin', 'owner', 'agent', 'homeowner'].map((r) => <option key={r} value={r}>{r}</option>)}
              <option value="">signed out</option>
            </select>
          </div>
        </>
      )}
      <h4>Lifecycle</h4>
      <div className="row">
        {Btn('opened', () => bus.emit('ava.opened'))}
        {Btn('closed', () => bus.emit('ava.closed'))}
        {Btn('disabled', () => bus.emit('ava.disabled', undefined, { reason: 'studio' }))}
        {Btn('enabled', () => bus.emit('ava.enabled'))}
        {Btn('reduced motion on', () => bus.emit('ava.settings.changed', undefined, { reducedMotion: true }))}
        {Btn('off', () => bus.emit('ava.settings.changed', undefined, { reducedMotion: false }))}
      </div>
      <h4>Input & reasoning</h4>
      <div className="row">
        {Btn('voice input', () => bus.emit('ava.input.started', newReq(), { modality: 'voice' }))}
        {Btn('voice end', () => bus.emit('ava.input.ended', r(), { modality: 'voice' }))}
        {Btn('mic denied', () => bus.emit('ava.permission.denied', undefined, { scope: 'microphone' }))}
        {Btn('thinking', () => bus.emit('ava.reasoning.started', newReq()))}
        {Btn('thinking end', () => bus.emit('ava.reasoning.ended', r()))}
      </div>
      <h4>Tools</h4>
      <div className="row">
        {Btn('tool start', () => { call.current = 'call_' + Math.random().toString(36).slice(2, 7); bus.emit('ava.tool.started', r(), { tool: 'leads.search', callId: call.current, mutating: false }); })}
        {Btn('✔ success (confirmed)', () => bus.emit('ava.tool.succeeded', r(), { ...tool, callId: call.current, backendConfirmed: true, completesTask: true }))}
        {Btn('✔ unconfirmed', () => bus.emit('ava.tool.succeeded', r(), { ...tool, callId: call.current, backendConfirmed: false, completesTask: true }))}
        {Btn('✖ failed', () => bus.emit('ava.tool.failed', r(), { ...tool, callId: call.current }))}
        {Btn('⏱ timeout', () => bus.emit('ava.tool.timed_out', r(), { ...tool, callId: call.current }))}
        {Btn('denied', () => bus.emit('ava.permission.denied', r(), { scope: 'action' }))}
        {Btn('stale success', () => bus.emit('ava.tool.succeeded', 'req_old', { tool: 'x', callId: 'call_old', backendConfirmed: true, completesTask: true }))}
      </div>
      <h4>Confirmation, answer, speech</h4>
      <div className="row">
        {Btn('confirm needed', () => bus.emit('ava.confirmation.required', r(), { actionId: 'act_demo' }))}
        {Btn('accept', () => bus.emit('ava.confirmation.accepted', r(), { actionId: 'act_demo' }))}
        {Btn('reject', () => bus.emit('ava.confirmation.rejected', r(), { actionId: 'act_demo' }))}
        {Btn('answer start', () => bus.emit('ava.answer.started', r()))}
        {Btn('answer end', () => bus.emit('ava.answer.ended', r()))}
        {Btn('speech start', () => bus.emit('ava.speech.started'))}
        {Btn('speech end', () => bus.emit('ava.speech.ended'))}
        {Btn('interrupt', () => bus.emit('ava.interrupted', undefined, { source: 'user' }))}
      </div>
      <h4>Tour</h4>
      <div className="row">
        {Btn('point: filters', () => bus.emit('ava.tour.step', undefined, { tourId: 't', stepId: 's1', anchorId: 'filters', anchorResolved: !!document.querySelector('[data-ava-anchor="filters"]') }))}
        {Btn('point: results', () => bus.emit('ava.tour.step', undefined, { tourId: 't', stepId: 's2', anchorId: 'lead-results', anchorResolved: true }))}
        {Btn('point: button', () => bus.emit('ava.tour.step', undefined, { tourId: 't', stepId: 's3', anchorId: 'followup-button', anchorResolved: true }))}
        {Btn('missing anchor', () => bus.emit('ava.tour.step', undefined, { tourId: 't', stepId: 's4', anchorId: 'nope', anchorResolved: false }))}
        {Btn('tour end', () => bus.emit('ava.tour.ended', undefined, { tourId: 't' }))}
      </div>

      <h4>Presentation</h4>
      <pre>{JSON.stringify({ ...presentation, clips: resolveClipIds(presentation) }, null, 1)}</pre>
      <h4>Truth</h4>
      <pre>{JSON.stringify({ req: state.currentRequestId, tools: Object.keys(state.tools), mic: state.micActive, speaking: state.speaking, confirm: state.confirmation?.actionId ?? null }, null, 1)}</pre>
      <h4>Event log</h4>
      <ol className="log">
        {log.slice(0, 14).map((l, i) => (
          <li key={i} className={l.disposition}>{l.type} <em>{l.disposition}{l.note ? ` · ${l.note}` : ''}</em></li>
        ))}
      </ol>
    </aside>
  );
}
