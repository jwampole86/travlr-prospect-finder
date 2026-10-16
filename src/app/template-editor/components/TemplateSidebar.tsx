import { AlertTriangle, Mail, MessageSquare, Plus, Search } from 'lucide-react';
import { EmptyState, Panel, StatusPill, buttonPrimary, inputClass } from '@/components/ops';
import { analyzeTemplateCompatibility, formatTemplateDate, type TemplateChannel, type TemplateRecord } from '../lib';

interface TemplateSidebarProps {
  channel: TemplateChannel;
  templates: TemplateRecord[];
  search: string;
  category: string;
  categories: string[];
  selectedId: string | null;
  onSearchChange: (value: string) => void;
  onCategoryChange: (value: string) => void;
  onSelect: (template: TemplateRecord) => void;
  onCreate: () => void;
}

export default function TemplateSidebar({
  channel,
  templates,
  search,
  category,
  categories,
  selectedId,
  onSearchChange,
  onCategoryChange,
  onSelect,
  onCreate,
}: TemplateSidebarProps) {
  return (
    <Panel
      title={channel === 'email' ? 'Email templates' : 'SMS templates'}
      actions={
        <button type="button" onClick={onCreate} className={buttonPrimary}>
          <Plus size={14} /> New
        </button>
      }
      className="h-full"
    >
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-[1fr_180px] lg:grid-cols-1 xl:grid-cols-[1fr_180px]">
          <label className="relative block">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="Search templates"
              className={`${inputClass} pl-9`}
            />
          </label>
          <select value={category} onChange={(event) => onCategoryChange(event.target.value)} className={inputClass}>
            <option value="all">All categories</option>
            {categories.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>

        {templates.length === 0 ? (
          <EmptyState
            icon={channel === 'email' ? Mail : MessageSquare}
            title={`No ${channel.toUpperCase()} templates match this filter`}
            hint="Clear the filters or create a new template."
            action={
              <button type="button" onClick={onCreate} className={buttonPrimary}>
                <Plus size={14} /> Create template
              </button>
            }
          />
        ) : (
          <div className="space-y-2">
            {templates.map((template) => {
              const compatibility = analyzeTemplateCompatibility(template.channel, template.subject, template.body);
              const hasIssues = compatibility.blockingTokens.length > 0;

              return (
                <button
                  key={template.id}
                  type="button"
                  onClick={() => onSelect(template)}
                  className={`w-full rounded-2xl border p-4 text-left transition-all ${
                    selectedId === template.id
                      ? 'border-primary bg-primary/5 shadow-sm'
                      : 'border-border bg-card hover:border-primary/40 hover:shadow-sm'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="rounded-xl bg-primary/10 p-2 text-primary">
                          {template.channel === 'email' ? <Mail size={14} /> : <MessageSquare size={14} />}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-foreground">{template.name}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {template.category}
                            {template.channel === 'sms' && template.tag ? ` · ${template.tag}` : ''}
                            {template.channel === 'email' && template.cadenceStep ? ` · Step ${template.cadenceStep}` : ''}
                          </p>
                        </div>
                      </div>
                    </div>
                    <StatusPill tone={hasIssues ? 'warning' : 'success'} icon={hasIssues ? AlertTriangle : undefined}>
                      {hasIssues ? `${compatibility.blockingTokens.length} issue${compatibility.blockingTokens.length === 1 ? '' : 's'}` : 'Send-safe'}
                    </StatusPill>
                  </div>
                  <p className="mt-3 line-clamp-2 text-xs leading-5 text-muted-foreground">
                    {template.channel === 'email' ? template.subject || template.body : template.body}
                  </p>
                  <div className="mt-3 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                    <span>{template.variables.length} merge field{template.variables.length === 1 ? '' : 's'}</span>
                    <span>{formatTemplateDate(template.updatedAt)}</span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </Panel>
  );
}
