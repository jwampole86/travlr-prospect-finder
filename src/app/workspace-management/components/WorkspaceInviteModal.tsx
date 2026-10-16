import { Loader2, Mail, UserPlus, X } from 'lucide-react';
import { buttonPrimary, buttonSecondary, inputClass, Panel, StatusPill } from '@/components/ops';
import type { InviteFormState, GranularRole } from '../types';
import { GRANULAR_ROLE_CONFIG } from '../utils';
import type { Portfolio } from '@/contexts/PortfolioContext';

export default function WorkspaceInviteModal({
  form,
  onChange,
  onTogglePortfolio,
  onClose,
  onSubmit,
  portfolios,
  submitting,
}: {
  form: InviteFormState;
  onChange: (patch: Partial<InviteFormState>) => void;
  onTogglePortfolio: (key: string) => void;
  onClose: () => void;
  onSubmit: () => void;
  portfolios: Portfolio[];
  submitting: boolean;
}) {
  const isOwner = form.role === 'owner';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 px-4 backdrop-blur-sm">
      <div className="w-full max-w-3xl rounded-3xl border border-border bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Invite workspace member</h2>
            <p className="text-sm text-muted-foreground">Creates a real invite record and preserves role + portfolio access.</p>
          </div>
          <button aria-label="Close invite modal" onClick={onClose} className="rounded-xl p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
            <X size={16} />
          </button>
        </div>

        <div className="grid gap-6 p-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-1.5">
                <span className="text-xs font-medium text-muted-foreground">Full name</span>
                <input
                  value={form.fullName}
                  onChange={(event) => onChange({ fullName: event.target.value })}
                  className={inputClass}
                  placeholder="Jamie Carter"
                />
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-medium text-muted-foreground">Email</span>
                <div className="relative">
                  <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    value={form.email}
                    onChange={(event) => onChange({ email: event.target.value })}
                    className={`${inputClass} pl-9`}
                    placeholder="jamie@staytrvlr.com"
                    type="email"
                  />
                </div>
              </label>
            </div>

            <div className="space-y-2">
              <span className="text-xs font-medium text-muted-foreground">Workspace role</span>
              <div className="grid gap-2 sm:grid-cols-2">
                {(Object.keys(GRANULAR_ROLE_CONFIG) as GranularRole[]).map((role) => {
                  const config = GRANULAR_ROLE_CONFIG[role];
                  const Icon = config.icon;
                  const selected = form.role === role;
                  return (
                    <button
                      key={role}
                      type="button"
                      onClick={() => onChange({ role })}
                      className={`rounded-2xl border p-3 text-left transition-colors ${selected ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted/40'}`}
                    >
                      <div className="flex items-center gap-2">
                        <span className={`rounded-xl p-2 ${selected ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                          <Icon size={14} />
                        </span>
                        <div>
                          <div className="text-sm font-medium text-foreground">{config.label}</div>
                          <div className="text-xs text-muted-foreground">{config.description}</div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <Panel title="Portfolio access" padded={false}>
            <div className="space-y-3 p-4">
              {isOwner ? (
                <div className="rounded-2xl border border-warning/30 bg-warning/10 p-4 text-sm text-warning">
                  Owners receive global access automatically. No explicit portfolio assignment is needed.
                </div>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground">Choose the states this teammate can work immediately after accepting the invite.</p>
                  <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                    {portfolios.map((portfolio) => {
                      const checked = form.assignedPortfolios.includes(portfolio.key);
                      return (
                        <button
                          key={portfolio.key}
                          type="button"
                          onClick={() => onTogglePortfolio(portfolio.key)}
                          className={`flex w-full items-center justify-between rounded-2xl border px-3 py-2 text-sm transition-colors ${checked ? 'border-primary bg-primary/10 text-foreground' : 'border-border hover:bg-muted/40'}`}
                        >
                          <div>
                            <div className="font-medium">{portfolio.label}</div>
                            <div className="text-xs text-muted-foreground">{portfolio.stateCode}</div>
                          </div>
                          {checked && <StatusPill tone="primary">Selected</StatusPill>}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </Panel>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-6 py-4">
          <p className="text-xs text-muted-foreground">Invites are stored in <code className="rounded bg-muted px-1 py-0.5">agent_invites</code> and remain editable until accepted.</p>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onClose} className={buttonSecondary}>Cancel</button>
            <button type="button" onClick={onSubmit} disabled={submitting} className={buttonPrimary}>
              {submitting ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />}
              {submitting ? 'Sending invite…' : 'Send invite'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
