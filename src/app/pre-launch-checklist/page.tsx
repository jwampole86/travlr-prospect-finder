'use client';

import React, { useState, useEffect, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';

import { CheckSquare, Square, AlertTriangle, CheckCircle, XCircle, Clock, FileText, Users, MessageSquare, Phone, Globe, ChevronDown, ChevronUp, ExternalLink, AlertCircle, Info, Lock } from 'lucide-react';
import Icon from '@/components/ui/AppIcon';


// ─── Types ────────────────────────────────────────────────────────────────────

type CheckStatus = 'complete' | 'incomplete' | 'pending' | 'na';

interface CheckItem {
  id: string;
  label: string;
  description: string;
  status: CheckStatus;
  notes: string;
  required: boolean;
  docLink?: string;
}

interface CheckSection {
  id: string;
  title: string;
  subtitle: string;
  icon: React.ElementType;
  iconColor: string;
  bgColor: string;
  items: CheckItem[];
}

// ─── State Recording Laws ─────────────────────────────────────────────────────

interface StateRecordingLaw {
  state: string;
  name: string;
  law: 'one_party' | 'all_party';
  notes: string;
  risk: 'low' | 'medium' | 'high';
}

const STATE_RECORDING_LAWS: StateRecordingLaw[] = [
  { state: 'CA', name: 'California', law: 'all_party', notes: 'Penal Code §632. All parties must consent. Violation = felony. Disclosure required at call start.', risk: 'high' },
  { state: 'FL', name: 'Florida', law: 'all_party', notes: 'F.S. §934.03. All parties must consent. Civil and criminal penalties.', risk: 'high' },
  { state: 'IL', name: 'Illinois', law: 'all_party', notes: 'EAVESDROPPING ACT 720 ILCS 5/14-2. All parties must consent.', risk: 'high' },
  { state: 'MD', name: 'Maryland', law: 'all_party', notes: 'MD Code, Courts §10-402. All parties must consent.', risk: 'high' },
  { state: 'MA', name: 'Massachusetts', law: 'all_party', notes: 'G.L. c. 272, §99. All parties must consent. Criminal penalties.', risk: 'high' },
  { state: 'MI', name: 'Michigan', law: 'all_party', notes: 'MCL §750.539c. All parties must consent.', risk: 'high' },
  { state: 'MT', name: 'Montana', law: 'all_party', notes: 'MCA §45-8-213. All parties must consent.', risk: 'high' },
  { state: 'NH', name: 'New Hampshire', law: 'all_party', notes: 'RSA §570-A:2. All parties must consent.', risk: 'high' },
  { state: 'OR', name: 'Oregon', law: 'all_party', notes: 'ORS §165.540. All parties must consent.', risk: 'high' },
  { state: 'PA', name: 'Pennsylvania', law: 'all_party', notes: '18 Pa.C.S. §5703. All parties must consent. Felony violation.', risk: 'high' },
  { state: 'WA', name: 'Washington', law: 'all_party', notes: 'RCW §9.73.030. All parties must consent.', risk: 'high' },
  { state: 'TX', name: 'Texas', law: 'one_party', notes: 'Tex. Penal Code §16.02. One-party consent. Standard disclosure recommended.', risk: 'low' },
  { state: 'NY', name: 'New York', law: 'one_party', notes: 'NY Penal Law §250.00. One-party consent. Standard disclosure recommended.', risk: 'low' },
  { state: 'GA', name: 'Georgia', law: 'one_party', notes: 'O.C.G.A. §16-11-62. One-party consent.', risk: 'low' },
  { state: 'AZ', name: 'Arizona', law: 'one_party', notes: 'A.R.S. §13-3005. One-party consent.', risk: 'low' },
  { state: 'CO', name: 'Colorado', law: 'one_party', notes: 'C.R.S. §18-9-303. One-party consent.', risk: 'low' },
  { state: 'NV', name: 'Nevada', law: 'all_party', notes: 'NRS §200.620. All parties must consent.', risk: 'high' },
  { state: 'OH', name: 'Ohio', law: 'one_party', notes: 'ORC §2933.52. One-party consent.', risk: 'low' },
  { state: 'NC', name: 'North Carolina', law: 'one_party', notes: 'N.C.G.S. §15A-287. One-party consent.', risk: 'low' },
  { state: 'TN', name: 'Tennessee', law: 'one_party', notes: 'T.C.A. §39-13-601. One-party consent.', risk: 'low' },
];

// ─── Default Checklist Data ───────────────────────────────────────────────────

function buildDefaultSections(): CheckSection[] {
  return [
    {
      id: 'pdl-legal',
      title: 'PDL Legal Review Sign-Off',
      subtitle: 'People Data Labs data usage compliance and legal authorization',
      icon: FileText,
      iconColor: 'text-blue-600',
      bgColor: 'bg-blue-500/10',
      items: [
        {
          id: 'pdl-1',
          label: 'PDL Data Processing Agreement (DPA) executed',
          description: 'Signed DPA with People Data Labs confirming lawful basis for processing personal data under CCPA/GDPR.',
          status: 'incomplete',
          notes: '',
          required: true,
          docLink: 'https://www.peopledatalabs.com/legal',
        },
        {
          id: 'pdl-2',
          label: 'PDL Terms of Service reviewed and accepted',
          description: 'Legal team has reviewed PDL ToS restrictions on data use, resale, and retention policies.',
          status: 'incomplete',
          notes: '',
          required: true,
        },
        {
          id: 'pdl-3',
          label: 'Permissible purpose documented for each data use case',
          description: 'Written documentation of permissible purpose (e.g., real estate outreach) for each PDL data type used.',
          status: 'incomplete',
          notes: '',
          required: true,
        },
        {
          id: 'pdl-4',
          label: 'Data retention and deletion policy configured',
          description: 'PDL-enriched data retention period set (max 12 months recommended). Deletion workflow tested.',
          status: 'incomplete',
          notes: '',
          required: true,
        },
        {
          id: 'pdl-5',
          label: 'CCPA opt-out mechanism live for California residents',
          description: '"Do Not Sell My Personal Information" link active on all consumer-facing pages. PDL data excluded from opted-out records.',
          status: 'incomplete',
          notes: '',
          required: true,
        },
      ],
    },
    {
      id: 'a2p-10dlc',
      title: 'A2P 10DLC Brand & Campaign Verification',
      subtitle: 'Required before any SMS outreach — carrier blocking enforced without registration',
      icon: MessageSquare,
      iconColor: 'text-purple-600',
      bgColor: 'bg-purple-500/10',
      items: [
        {
          id: 'a2p-1',
          label: 'Brand registration submitted and approved (TCR)',
          description: 'Business brand registered with The Campaign Registry (TCR). EIN, business name, and address verified.',
          status: 'incomplete',
          notes: '',
          required: true,
          docLink: 'https://www.campaignregistry.com',
        },
        {
          id: 'a2p-2',
          label: 'Campaign use case registered (Real Estate / Marketing)',
          description: 'Campaign registered under correct use case. Sample messages submitted and approved by TCR.',
          status: 'incomplete',
          notes: '',
          required: true,
        },
        {
          id: 'a2p-3',
          label: 'Twilio phone number linked to approved campaign',
          description: 'TRAVLR Twilio number assigned to the approved A2P campaign in Twilio Console.',
          status: 'incomplete',
          notes: '',
          required: true,
        },
        {
          id: 'a2p-4',
          label: 'STOP/HELP/UNSUBSCRIBE keywords configured',
          description: 'Twilio webhook handles STOP, HELP, UNSUBSCRIBE, CANCEL, END, QUIT keywords. Opt-out recorded in leads table.',
          status: 'incomplete',
          notes: '',
          required: true,
        },
        {
          id: 'a2p-5',
          label: 'Opt-in language included in all SMS templates',
          description: 'Every initial SMS includes: "Reply STOP to opt out. Msg & data rates may apply." Verified in template library.',
          status: 'incomplete',
          notes: '',
          required: true,
        },
        {
          id: 'a2p-6',
          label: 'Carrier throughput limits acknowledged',
          description: 'Team briefed on 10DLC throughput limits (3 msg/sec standard). Bulk send rate-limiting configured in cadence engine.',
          status: 'incomplete',
          notes: '',
          required: false,
        },
      ],
    },
    {
      id: 'agent-classification',
      title: 'Agent W-2 / 1099 Classification',
      subtitle: 'Worker classification compliance before agent outreach begins',
      icon: Users,
      iconColor: 'text-emerald-600',
      bgColor: 'bg-emerald-500/10',
      items: [
        {
          id: 'agent-1',
          label: 'All active agents classified as W-2 or 1099',
          description: 'Each agent record has a confirmed classification. No agents in "unclassified" status.',
          status: 'incomplete',
          notes: '',
          required: true,
        },
        {
          id: 'agent-2',
          label: 'IRS Form W-9 collected for all 1099 contractors',
          description: 'W-9 on file for every agent classified as independent contractor. Stored securely.',
          status: 'incomplete',
          notes: '',
          required: true,
        },
        {
          id: 'agent-3',
          label: 'Independent contractor agreements signed (1099 agents)',
          description: 'Signed IC agreement on file for each 1099 agent. Agreement reviewed by legal for misclassification risk.',
          status: 'incomplete',
          notes: '',
          required: true,
        },
        {
          id: 'agent-4',
          label: 'Commission agreement signed by all agents',
          description: 'DocuSign Partnership/Commission Agreement completed for every active agent. Verified in signing portal.',
          status: 'incomplete',
          notes: '',
          required: true,
        },
        {
          id: 'agent-5',
          label: 'Stripe Connect onboarding complete for all agents',
          description: 'Each agent has completed Stripe Connect identity verification for commission payouts.',
          status: 'incomplete',
          notes: '',
          required: true,
        },
        {
          id: 'agent-6',
          label: 'State-specific labor law review completed',
          description: 'Legal review of agent classification under California AB5, New York, and other strict-classification states where agents operate.',
          status: 'incomplete',
          notes: '',
          required: false,
        },
      ],
    },
    {
      id: 'tcpa-policies',
      title: 'State-by-State TCPA & Recording-Consent Policies',
      subtitle: 'Per-state compliance configuration before live SMS/calls',
      icon: Phone,
      iconColor: 'text-red-600',
      bgColor: 'bg-red-500/10',
      items: [
        {
          id: 'tcpa-1',
          label: 'National DNC Registry scrub process active',
          description: 'Automated DNC check runs before every outreach. Leads on national DNC list are flagged and blocked from SMS/call.',
          status: 'incomplete',
          notes: '',
          required: true,
          docLink: 'https://www.donotcall.gov',
        },
        {
          id: 'tcpa-2',
          label: 'State DNC lists checked for all active states',
          description: 'State-level DNC registries checked for: CA, FL, TX, NY, WA, IL, PA, OH, GA, NC. Automated or manual process documented.',
          status: 'incomplete',
          notes: '',
          required: true,
        },
        {
          id: 'tcpa-3',
          label: 'Prior express written consent documented for autodialed SMS',
          description: 'Written consent (web form, DocuSign, or inbound opt-in) on file for all leads receiving autodialed or pre-recorded messages.',
          status: 'incomplete',
          notes: '',
          required: true,
        },
        {
          id: 'tcpa-4',
          label: 'Call time restrictions enforced (8am–9pm local time)',
          description: 'Cadence engine and dialer enforce 8am–9pm local time restriction per TCPA. Time-zone detection active for all leads.',
          status: 'incomplete',
          notes: '',
          required: true,
        },
        {
          id: 'tcpa-5',
          label: 'All-party consent state call disclosure script active',
          description: 'Teleprompter auto-loads recording disclosure script for CA, FL, IL, MD, MA, MI, MT, NH, OR, PA, WA, NV leads. Disclosure logged per call.',
          status: 'incomplete',
          notes: '',
          required: true,
        },
        {
          id: 'tcpa-6',
          label: 'Call recording disclosure logged per call record',
          description: 'Every call record captures: disclosure_played (boolean), disclosure_timestamp, state, and recording_law. Visible in Compliance Audit.',
          status: 'incomplete',
          notes: '',
          required: true,
        },
        {
          id: 'tcpa-7',
          label: 'TCPA litigation hold policy documented',
          description: 'Legal team has documented data retention policy for TCPA defense: call logs, consent records, and DNC checks retained for 4+ years.',
          status: 'incomplete',
          notes: '',
          required: false,
        },
        {
          id: 'tcpa-8',
          label: 'Revocation of consent process tested',
          description: 'STOP reply → opt-out recorded → no further SMS sent. Tested end-to-end. Opt-out visible in Compliance Audit within 10 business days.',
          status: 'incomplete',
          notes: '',
          required: true,
        },
      ],
    },
  ];
}

// ─── Status Badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: CheckStatus }) {
  const map: Record<CheckStatus, { label: string; cls: string; icon: React.ElementType }> = {
    complete: { label: 'Complete', cls: 'bg-emerald-500/10 text-emerald-700 border-emerald-200', icon: CheckCircle },
    incomplete: { label: 'Incomplete', cls: 'bg-red-500/10 text-red-700 border-red-200', icon: XCircle },
    pending: { label: 'In Progress', cls: 'bg-amber-500/10 text-amber-700 border-amber-200', icon: Clock },
    na: { label: 'N/A', cls: 'bg-muted text-muted-foreground border-border', icon: Info },
  };
  const { label, cls, icon: Icon } = map[status];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-semibold ${cls}`}>
      <Icon size={9} /> {label}
    </span>
  );
}

// ─── Check Item Row ───────────────────────────────────────────────────────────

function CheckItemRow({
  item,
  onStatusChange,
  onNotesChange,
}: {
  item: CheckItem;
  onStatusChange: (id: string, status: CheckStatus) => void;
  onNotesChange: (id: string, notes: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesValue, setNotesValue] = useState(item.notes);

  const statusCycle: CheckStatus[] = ['incomplete', 'pending', 'complete', 'na'];

  function cycleStatus() {
    const idx = statusCycle.indexOf(item.status);
    const next = statusCycle[(idx + 1) % statusCycle.length];
    onStatusChange(item.id, next);
  }

  function saveNotes() {
    onNotesChange(item.id, notesValue);
    setEditingNotes(false);
  }

  const rowBg = item.status === 'complete'
    ? 'bg-emerald-500/[0.02]'
    : item.status === 'incomplete'&& item.required ?'bg-red-500/[0.02]' :'';

  return (
    <div className={`border-b border-border last:border-0 ${rowBg}`}>
      <div className="flex items-start gap-3 px-4 py-3">
        <button
          onClick={cycleStatus}
          className="mt-0.5 shrink-0 transition-colors"
          title="Click to cycle status"
        >
          {item.status === 'complete' ? (
            <CheckSquare size={16} className="text-emerald-600" />
          ) : (
            <Square size={16} className={item.required && item.status === 'incomplete' ? 'text-red-400' : 'text-muted-foreground'} />
          )}
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className={`text-xs font-medium ${item.status === 'complete' ? 'text-muted-foreground line-through' : 'text-foreground'}`}>
                  {item.label}
                </p>
                {item.required && item.status !== 'complete' && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-600 font-semibold">Required</span>
                )}
              </div>
              {expanded && (
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{item.description}</p>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <StatusBadge status={item.status} />
              {item.docLink && (
                <a
                  href={item.docLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-1 rounded text-muted-foreground hover:text-primary transition-colors"
                  title="Open reference"
                >
                  <ExternalLink size={11} />
                </a>
              )}
              <button
                onClick={() => setExpanded(v => !v)}
                className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors"
              >
                {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              </button>
            </div>
          </div>

          {expanded && (
            <div className="mt-3 space-y-2">
              {/* Status selector */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] text-muted-foreground font-medium">Status:</span>
                {(['incomplete', 'pending', 'complete', 'na'] as CheckStatus[]).map(s => (
                  <button
                    key={s}
                    onClick={() => onStatusChange(item.id, s)}
                    className={`text-[10px] px-2 py-1 rounded-md border transition-all font-medium ${
                      item.status === s ? 'bg-primary/10 border-primary/30 text-primary' : 'border-border text-muted-foreground hover:bg-muted'
                    }`}
                  >
                    {s === 'na' ? 'N/A' : s.charAt(0).toUpperCase() + s.slice(1)}
                  </button>
                ))}
              </div>

              {/* Notes */}
              <div>
                <p className="text-[10px] text-muted-foreground font-medium mb-1">Notes / Evidence:</p>
                {editingNotes ? (
                  <div className="flex gap-2">
                    <textarea
                      value={notesValue}
                      onChange={e => setNotesValue(e.target.value)}
                      rows={2}
                      className="flex-1 text-xs bg-background border border-border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
                      placeholder="Add notes, ticket numbers, or evidence links…"
                    />
                    <div className="flex flex-col gap-1">
                      <button onClick={saveNotes} className="px-2 py-1 text-[10px] bg-primary text-primary-foreground rounded-md hover:opacity-90">Save</button>
                      <button onClick={() => { setEditingNotes(false); setNotesValue(item.notes); }} className="px-2 py-1 text-[10px] border border-border rounded-md hover:bg-muted text-muted-foreground">Cancel</button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setEditingNotes(true)}
                    className="w-full text-left text-xs px-3 py-2 rounded-lg border border-dashed border-border hover:border-primary/40 hover:bg-muted/30 transition-all text-muted-foreground"
                  >
                    {item.notes || 'Click to add notes…'}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Section Card ─────────────────────────────────────────────────────────────

function SectionCard({
  section,
  onStatusChange,
  onNotesChange,
}: {
  section: CheckSection;
  onStatusChange: (sectionId: string, itemId: string, status: CheckStatus) => void;
  onNotesChange: (sectionId: string, itemId: string, notes: string) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const Icon = section.icon;
  const total = section.items.length;
  const complete = section.items.filter(i => i.status === 'complete' || i.status === 'na').length;
  const requiredIncomplete = section.items.filter(i => i.required && i.status === 'incomplete').length;
  const pct = Math.round((complete / total) * 100);

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <button
        onClick={() => setCollapsed(v => !v)}
        className="w-full flex items-center gap-3 px-5 py-4 hover:bg-muted/20 transition-colors text-left"
      >
        <div className={`w-9 h-9 rounded-lg ${section.bgColor} flex items-center justify-center shrink-0`}>
          <Icon size={17} className={section.iconColor} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold text-foreground">{section.title}</p>
            {requiredIncomplete > 0 && (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-600 font-semibold">
                {requiredIncomplete} required item{requiredIncomplete !== 1 ? 's' : ''} incomplete
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">{section.subtitle}</p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <div className="text-right">
            <p className="text-xs font-semibold text-foreground">{complete}/{total}</p>
            <p className="text-[10px] text-muted-foreground">{pct}% done</p>
          </div>
          <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${pct === 100 ? 'bg-emerald-500' : pct > 50 ? 'bg-amber-500' : 'bg-red-500'}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          {collapsed ? <ChevronDown size={14} className="text-muted-foreground" /> : <ChevronUp size={14} className="text-muted-foreground" />}
        </div>
      </button>

      {!collapsed && (
        <div className="border-t border-border">
          {section.items.map(item => (
            <CheckItemRow
              key={item.id}
              item={item}
              onStatusChange={(id, status) => onStatusChange(section.id, id, status)}
              onNotesChange={(id, notes) => onNotesChange(section.id, id, notes)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PreLaunchChecklistPage() {
  const [sections, setSections] = useState<CheckSection[]>(buildDefaultSections);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [activeTab, setActiveTab] = useState<'checklist' | 'state-laws'>('checklist');

  // Load from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('travlr_prelaunch_checklist');
      if (saved) {
        const parsed = JSON.parse(saved);
        setSections(prev => prev.map(section => {
          const savedSection = parsed.find((s: any) => s.id === section.id);
          if (!savedSection) return section;
          return {
            ...section,
            items: section.items.map(item => {
              const savedItem = savedSection.items?.find((i: any) => i.id === item.id);
              return savedItem ? { ...item, status: savedItem.status, notes: savedItem.notes } : item;
            }),
          };
        }));
      }
    } catch {}
  }, []);

  // Save to localStorage
  function saveProgress() {
    const toSave = sections.map(s => ({
      id: s.id,
      items: s.items.map(i => ({ id: i.id, status: i.status, notes: i.notes })),
    }));
    localStorage.setItem('travlr_prelaunch_checklist', JSON.stringify(toSave));
    setSavedAt(new Date());
  }

  function handleStatusChange(sectionId: string, itemId: string, status: CheckStatus) {
    setSections(prev => prev.map(s =>
      s.id !== sectionId ? s : {
        ...s,
        items: s.items.map(i => i.id !== itemId ? i : { ...i, status }),
      }
    ));
  }

  function handleNotesChange(sectionId: string, itemId: string, notes: string) {
    setSections(prev => prev.map(s =>
      s.id !== sectionId ? s : {
        ...s,
        items: s.items.map(i => i.id !== itemId ? i : { ...i, notes }),
      }
    ));
  }

  // Overall stats
  const allItems = sections.flatMap(s => s.items);
  const totalItems = allItems.length;
  const completeItems = allItems.filter(i => i.status === 'complete' || i.status === 'na').length;
  const requiredIncomplete = allItems.filter(i => i.required && i.status === 'incomplete').length;
  const overallPct = Math.round((completeItems / totalItems) * 100);
  const isReadyToLaunch = requiredIncomplete === 0;

  return (
    <AppLayout>
      <div className="flex flex-col h-full min-h-0 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-card shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
              <Lock size={17} className="text-primary" />
            </div>
            <div>
              <h1 className="text-base font-semibold text-foreground">Pre-Launch Compliance Checklist</h1>
              <p className="text-xs text-muted-foreground">PDL legal · A2P 10DLC · Agent classification · TCPA/recording-consent policies</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {savedAt && (
              <span className="text-[10px] text-muted-foreground">
                Saved {savedAt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
            <button
              onClick={saveProgress}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground text-xs rounded-lg hover:opacity-90 transition-opacity font-medium"
            >
              <CheckSquare size={12} /> Save Progress
            </button>
          </div>
        </div>

        {/* Launch Readiness Banner */}
        <div className={`mx-6 mt-4 p-4 rounded-xl border flex items-center gap-4 shrink-0 ${
          isReadyToLaunch
            ? 'bg-emerald-500/8 border-emerald-300' :'bg-amber-500/8 border-amber-300'
        }`}>
          <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
            isReadyToLaunch ? 'bg-emerald-500/10' : 'bg-amber-500/10'
          }`}>
            {isReadyToLaunch
              ? <CheckCircle size={20} className="text-emerald-600" />
              : <AlertTriangle size={20} className="text-amber-600" />
            }
          </div>
          <div className="flex-1 min-w-0">
            <p className={`text-sm font-semibold ${isReadyToLaunch ? 'text-emerald-700' : 'text-amber-700'}`}>
              {isReadyToLaunch ? 'Ready to Launch' : `${requiredIncomplete} Required Item${requiredIncomplete !== 1 ? 's' : ''} Incomplete`}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {isReadyToLaunch
                ? 'All required compliance items are complete. You may proceed with live SMS and call outreach.'
                : 'Complete all required items before enabling live SMS/call outreach to avoid TCPA violations and carrier blocking.'
              }
            </p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-2xl font-bold text-foreground">{overallPct}%</p>
            <p className="text-[10px] text-muted-foreground">{completeItems}/{totalItems} items</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-6 pt-4 border-b border-border shrink-0">
          {(['checklist', 'state-laws'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium border-b-2 transition-all ${
                activeTab === tab ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab === 'checklist' ? <CheckSquare size={12} /> : <Globe size={12} />}
              {tab === 'checklist' ? 'Compliance Checklist' : 'State Recording Laws'}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {activeTab === 'checklist' && (
            <>
              {sections.map(section => (
                <SectionCard
                  key={section.id}
                  section={section}
                  onStatusChange={handleStatusChange}
                  onNotesChange={handleNotesChange}
                />
              ))}
              <p className="text-[10px] text-muted-foreground text-center pb-4">
                Progress is saved locally. For team-wide tracking, export and share with your compliance officer.
              </p>
            </>
          )}

          {activeTab === 'state-laws' && (
            <div className="space-y-4">
              {/* Legend */}
              <div className="flex items-center gap-4 p-3 bg-muted/30 rounded-xl border border-border">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="w-3 h-3 rounded-full bg-red-500 shrink-0" />
                  All-Party Consent (disclosure required)
                </div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="w-3 h-3 rounded-full bg-emerald-500 shrink-0" />
                  One-Party Consent (disclosure recommended)
                </div>
              </div>

              {/* All-party states */}
              <div>
                <h3 className="text-xs font-semibold text-foreground mb-3 flex items-center gap-2">
                  <AlertTriangle size={13} className="text-red-500" />
                  All-Party Consent States ({STATE_RECORDING_LAWS.filter(s => s.law === 'all_party').length} states)
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {STATE_RECORDING_LAWS.filter(s => s.law === 'all_party').map(s => (
                    <div key={s.state} className="p-3 bg-red-500/5 border border-red-200 rounded-xl">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-bold text-red-700 bg-red-500/10 px-2 py-0.5 rounded">{s.state}</span>
                        <p className="text-xs font-semibold text-foreground">{s.name}</p>
                        <span className="ml-auto text-[9px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-700 font-semibold">All-Party</span>
                      </div>
                      <p className="text-[10px] text-muted-foreground leading-relaxed">{s.notes}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* One-party states */}
              <div>
                <h3 className="text-xs font-semibold text-foreground mb-3 flex items-center gap-2">
                  <CheckCircle size={13} className="text-emerald-500" />
                  One-Party Consent States ({STATE_RECORDING_LAWS.filter(s => s.law === 'one_party').length} states)
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {STATE_RECORDING_LAWS.filter(s => s.law === 'one_party').map(s => (
                    <div key={s.state} className="p-3 bg-emerald-500/5 border border-emerald-200 rounded-xl">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-bold text-emerald-700 bg-emerald-500/10 px-2 py-0.5 rounded">{s.state}</span>
                        <p className="text-xs font-semibold text-foreground">{s.name}</p>
                        <span className="ml-auto text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-700 font-semibold">One-Party</span>
                      </div>
                      <p className="text-[10px] text-muted-foreground leading-relaxed">{s.notes}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="p-4 bg-amber-500/8 border border-amber-300 rounded-xl">
                <p className="text-xs font-semibold text-amber-700 mb-1 flex items-center gap-1.5">
                  <AlertCircle size={12} /> Legal Disclaimer
                </p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  This table is for informational purposes only and does not constitute legal advice. Recording consent laws change frequently. 
                  Consult a licensed attorney in each state where you operate before recording calls. TRAVLR recommends disclosing call recording 
                  to all parties on every call regardless of state law as a best practice.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
