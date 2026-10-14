'use client';

import { CheckCircle2, Users, MessageSquare, Activity } from 'lucide-react';

const OVERVIEW = [
  { label: 'Hot leads', value: '14', hint: 'Open the people behind it' },
  { label: 'Replies today', value: '23', hint: 'Open the conversations' },
  { label: 'Texts sent this week', value: '412', hint: 'See who got what' },
  { label: 'Opt-outs honored', value: '9', hint: 'Always stopped, always logged' },
];

const SYSTEMS = [
  { name: 'Text delivery', detail: 'Delivering normally' },
  { name: 'Lead database', detail: 'Healthy' },
  { name: 'Scheduled campaigns', detail: 'Next send 9:00 AM Mountain' },
  { name: 'Email', detail: 'Healthy' },
];

const CHAT = [
  { who: 'Priya', text: 'Hot lead in Scottsdale just replied YES, calling now.' },
  { who: 'Marcus', text: 'Nice. Logging the audit offer on the Destin listing.' },
];

// Sanitized mock of the operating layer: Executive Overview with drill-down panels,
// live System Status, and Team Chat.
export default function OperateShowcase() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {OVERVIEW.map((o) => (
          <div key={o.label} className="bg-card rounded-xl border border-border p-4 min-w-0 hover:border-primary/40 transition-colors">
            <Users size={14} className="text-primary mb-2" />
            <p className="text-lg sm:text-xl font-bold text-foreground leading-tight">{o.value}</p>
            <p className="text-[11px] font-semibold text-foreground mt-0.5">{o.label}</p>
            <p className="text-[10px] text-muted-foreground leading-snug">{o.hint}</p>
          </div>
        ))}
      </div>
      <div className="grid md:grid-cols-2 gap-3">
        <div className="bg-card rounded-xl border border-border p-4">
          <div className="flex items-center gap-2 mb-3">
            <Activity size={14} className="text-primary" />
            <p className="text-xs font-bold text-foreground">System Status</p>
            <span className="ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600">All systems operational</span>
          </div>
          <ul className="space-y-2">
            {SYSTEMS.map((s) => (
              <li key={s.name} className="flex items-center gap-2 text-xs">
                <CheckCircle2 size={13} className="text-emerald-500 shrink-0" />
                <span className="font-medium text-foreground">{s.name}</span>
                <span className="ml-auto text-[10px] text-muted-foreground text-right">{s.detail}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="bg-card rounded-xl border border-border p-4">
          <div className="flex items-center gap-2 mb-3">
            <MessageSquare size={14} className="text-primary" />
            <p className="text-xs font-bold text-foreground">Team Chat</p>
            <span className="ml-auto text-[10px] text-muted-foreground"># hot-leads</span>
          </div>
          <div className="space-y-2">
            {CHAT.map((c) => (
              <div key={c.text} className="rounded-lg bg-muted/40 px-3 py-2">
                <p className="text-[10px] font-bold text-foreground">{c.who}</p>
                <p className="text-xs text-muted-foreground leading-snug">{c.text}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
