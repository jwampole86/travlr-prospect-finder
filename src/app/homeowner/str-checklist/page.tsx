'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { CheckCircle2, Clock, AlertCircle, Search, Shield, Camera, Settings, FileText, CheckSquare, Upload, Loader2, ChevronDown, Zap, Info, File, Trash2, ClipboardList, RefreshCw, ExternalLink, CheckCircle } from 'lucide-react';
import { cityRegulations } from '@/data/regulations';

// ─── Types ────────────────────────────────────────────────────────────────────

type StepStatus = 'pending' | 'in_progress' | 'completed' | 'blocked';

interface ChecklistStep {
  id?: string;
  step_number: number;
  step_key: string;
  status: StepStatus;
  notes?: string;
  completed_at?: string;
}

interface UploadedDoc {
  id: string;
  step_number: number;
  document_category: string;
  file_name: string;
  file_url: string;
  file_size_bytes?: number;
  mime_type?: string;
  notes?: string;
  review_status?: 'pending_review' | 'under_review' | 'approved' | 'rejected';
  reviewed_at?: string;
  review_notes?: string;
  uploaded_at: string;
}

// ─── Step Definitions ─────────────────────────────────────────────────────────

const STEPS = [
  {
    step_number: 1,
    step_key: 'assessment_prep',
    title: 'Assessment & Prep',
    subtitle: 'Week 1',
    icon: Search,
    color: 'text-blue-600',
    bg: 'bg-blue-50 dark:bg-blue-950/30',
    border: 'border-blue-200 dark:border-blue-800',
    badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300',
    items: [
      'Walkthrough/inspection to document condition, amenities, and any needed repairs or upgrades',
      'Safety compliance check (smoke/CO detectors, fire extinguisher, first aid kit, lockboxes)',
      'Determine furnishing/staging gaps against brand standard',
    ],
    uploadCategories: [
      { value: 'inspection_report', label: 'Inspection Report' },
      { value: 'other', label: 'Other Document' },
    ],
    guidance: 'Your TRAVLR coordinator will schedule a walkthrough within the first week. You can upload any existing inspection reports or documentation here.',
  },
  {
    step_number: 2,
    step_key: 'legal_compliance',
    title: 'Legal & Compliance',
    subtitle: 'Runs in parallel',
    icon: Shield,
    color: 'text-purple-600',
    bg: 'bg-purple-50 dark:bg-purple-950/30',
    border: 'border-purple-200 dark:border-purple-800',
    badge: 'bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300',
    items: [
      'Verify STR permit/license status with city/county (critical in Coachella Valley — Palm Desert, Indio, etc. have specific STR ordinances and caps)',
      'Confirm TOT (Transient Occupancy Tax) registration',
      'HOA approval if applicable',
    ],
    uploadCategories: [
      { value: 'str_permit', label: 'STR Permit / License' },
      { value: 'tot_registration', label: 'TOT Registration' },
      { value: 'hoa_approval', label: 'HOA Approval Letter' },
      { value: 'other', label: 'Other Legal Document' },
    ],
    guidance: 'Upload your STR permit, TOT registration, and HOA approval documents here. This step is critical — many Coachella Valley cities have specific STR ordinances and permit caps.',
  },
  {
    step_number: 3,
    step_key: 'photography_content',
    title: 'Photography & Content',
    subtitle: 'After staging',
    icon: Camera,
    color: 'text-pink-600',
    bg: 'bg-pink-50 dark:bg-pink-950/30',
    border: 'border-pink-200 dark:border-pink-800',
    badge: 'bg-pink-100 text-pink-700 dark:bg-pink-900/50 dark:text-pink-300',
    items: [
      'Schedule professional photography once staging is complete',
      'Capture video/drone footage if used for premium listings',
      'Gather property specs (sq ft, bed/bath count, amenities list, house rules)',
    ],
    uploadCategories: [
      { value: 'property_photos', label: 'Property Photos' },
      { value: 'floor_plan', label: 'Floor Plan' },
      { value: 'other', label: 'Other Media' },
    ],
    guidance: 'Professional photography is scheduled after staging is complete. You can upload any existing photos or floor plans to help our team prepare.',
  },
  {
    step_number: 4,
    step_key: 'operations_setup',
    title: 'Operations Setup',
    subtitle: 'Tech & vendors',
    icon: Settings,
    color: 'text-orange-600',
    bg: 'bg-orange-50 dark:bg-orange-950/30',
    border: 'border-orange-200 dark:border-orange-800',
    badge: 'bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300',
    items: [
      'Add property to OwnerRez (PMS/channel manager)',
      'Log lead and property details in TRAVLR Prospect Finder',
      'Set up cleaning/turnover vendor and supply stocking',
      'Install smart locks (Yale or August), noise monitors (Layla), thermostats (Nest)',
      'Set up guest communication templates and check-in instructions',
    ],
    uploadCategories: [
      { value: 'other', label: 'Vendor Agreement / Other' },
    ],
    guidance: 'Your coordinator handles OwnerRez setup and vendor coordination. Smart home devices (Yale/August locks, Layla noise monitors, Nest thermostats) will be installed as part of our standard tech stack.',
  },
  {
    step_number: 5,
    step_key: 'listing_creation',
    title: 'Listing Creation',
    subtitle: 'Go-to-market',
    icon: FileText,
    color: 'text-teal-600',
    bg: 'bg-teal-50 dark:bg-teal-950/30',
    border: 'border-teal-200 dark:border-teal-800',
    badge: 'bg-teal-100 text-teal-700 dark:bg-teal-900/50 dark:text-teal-300',
    items: [
      'Draft listing copy, pricing strategy (comp analysis), and calendar/minimum stay rules',
      'Set up STR and other channel listings, sync calendars',
      'Soft-launch pricing to build initial reviews, then adjust',
    ],
    uploadCategories: [
      { value: 'other', label: 'Supporting Document' },
    ],
    guidance: 'Our team drafts all listing copy and pricing strategy. Soft-launch pricing is used initially to build reviews, then optimized based on market data.',
  },
  {
    step_number: 6,
    step_key: 'pre_launch_qa',
    title: 'Pre-Launch QA',
    subtitle: 'Final check',
    icon: CheckSquare,
    color: 'text-emerald-600',
    bg: 'bg-emerald-50 dark:bg-emerald-950/30',
    border: 'border-emerald-200 dark:border-emerald-800',
    badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300',
    items: [
      'Final walkthrough against listing photos/description for accuracy',
      'Test guest journey — booking confirmation, check-in instructions, Wi-Fi, etc.',
    ],
    uploadCategories: [
      { value: 'other', label: 'QA Checklist / Other' },
    ],
    guidance: 'The final walkthrough ensures everything matches the listing. Once QA is complete, your property goes live and starts accepting bookings.',
  },
];

const STATUS_CONFIG: Record<StepStatus, { label: string; icon: React.ReactNode; color: string; bg: string; border: string }> = {
  pending: {
    label: 'Not Started',
    icon: <Clock size={12} />,
    color: 'text-muted-foreground',
    bg: 'bg-muted',
    border: 'border-border',
  },
  in_progress: {
    label: 'In Progress',
    icon: <AlertCircle size={12} />,
    color: 'text-amber-600',
    bg: 'bg-amber-500/10',
    border: 'border-amber-300',
  },
  completed: {
    label: 'Completed',
    icon: <CheckCircle2 size={12} />,
    color: 'text-emerald-600',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-300',
  },
  blocked: {
    label: 'Needs Attention',
    icon: <AlertCircle size={12} />,
    color: 'text-red-500',
    bg: 'bg-red-500/10',
    border: 'border-red-300',
  },
};

const DOC_CATEGORY_LABELS: Record<string, string> = {
  str_permit: 'STR Permit',
  hoa_approval: 'HOA Approval',
  tot_registration: 'TOT Registration',
  inspection_report: 'Inspection Report',
  property_photos: 'Property Photos',
  floor_plan: 'Floor Plan',
  insurance: 'Insurance',
  other: 'Other',
};

function formatBytes(bytes?: number) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ─── Animated Expand Panel ────────────────────────────────────────────────────

function ExpandPanel({ open, children }: { open: boolean; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | undefined>(open ? undefined : 0);

  useEffect(() => {
    if (!ref.current) return;
    if (open) {
      // Measure then animate to full height
      const h = ref.current.scrollHeight;
      setHeight(h);
      const timer = setTimeout(() => setHeight(undefined), 320);
      return () => clearTimeout(timer);
    } else {
      // Snap to current height then animate to 0
      const h = ref.current.scrollHeight;
      setHeight(h);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setHeight(0));
      });
    }
  }, [open]);

  return (
    <div
      style={{
        height: height === undefined ? 'auto' : height,
        overflow: 'hidden',
        transition: 'height 280ms cubic-bezier(0.4, 0, 0.2, 1)',
      }}
    >
      <div ref={ref}>
        {children}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function STRChecklistPage() {
  const supabase = createClient();
  const [leadId, setLeadId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [steps, setSteps] = useState<ChecklistStep[]>([]);
  const [documents, setDocuments] = useState<UploadedDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedStep, setExpandedStep] = useState<number | null>(1);
  const [updatingStep, setUpdatingStep] = useState<number | null>(null);
  const [uploadingStep, setUploadingStep] = useState<number | null>(null);
  const [uploadCategory, setUploadCategory] = useState<Record<number, string>>({});
  const [uploadNotes, setUploadNotes] = useState<Record<number, string>>({});
  const [deletingDoc, setDeletingDoc] = useState<string | null>(null);
  const [leadCity, setLeadCity] = useState<string | null>(null);
  const fileInputRefs = useRef<Record<number, HTMLInputElement | null>>({});

  // ── Load data ──────────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const { data: userRes } = await supabase.auth.getUser();
      if (!userRes.user) return;
      setUserId(userRes.user.id);

      const { data: propLinks } = await supabase
        .from('property_homeowners')
        .select('lead_id')
        .eq('homeowner_user_id', userRes.user.id)
        .limit(1);

      const primaryLeadId = propLinks?.[0]?.lead_id ?? null;
      setLeadId(primaryLeadId);
      if (!primaryLeadId) return;

      // Load lead city for dynamic regulation guidance
      const { data: leadData } = await supabase
        .from('leads')
        .select('city, state')
        .eq('id', primaryLeadId)
        .single();
      if (leadData?.city) setLeadCity(leadData.city);

      // Load checklist steps
      const { data: stepsData } = await supabase
        .from('str_checklist_steps')
        .select('*')
        .eq('lead_id', primaryLeadId)
        .order('step_number');

      // Merge DB steps with defaults
      const merged: ChecklistStep[] = STEPS.map(s => {
        const found = stepsData?.find(d => d.step_number === s.step_number);
        return found
          ? { id: found.id, step_number: found.step_number, step_key: found.step_key, status: found.status as StepStatus, notes: found.notes, completed_at: found.completed_at }
          : { step_number: s.step_number, step_key: s.step_key, status: 'pending' as StepStatus };
      });
      setSteps(merged);

      // Load documents
      const { data: docsData } = await supabase
        .from('str_checklist_documents')
        .select('*')
        .eq('lead_id', primaryLeadId)
        .order('uploaded_at', { ascending: false });
      setDocuments(docsData ?? []);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Update step status ─────────────────────────────────────────────────────
  async function updateStepStatus(stepNumber: number, newStatus: StepStatus) {
    if (!leadId || !userId) return;
    setUpdatingStep(stepNumber);
    try {
      const existing = steps.find(s => s.step_number === stepNumber);
      const payload = {
        lead_id: leadId,
        homeowner_user_id: userId,
        step_number: stepNumber,
        step_key: STEPS[stepNumber - 1].step_key,
        status: newStatus,
        completed_at: newStatus === 'completed' ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      };

      if (existing?.id) {
        await supabase.from('str_checklist_steps').update(payload).eq('id', existing.id);
      } else {
        await supabase.from('str_checklist_steps').insert(payload);
      }

      setSteps(prev => prev.map(s =>
        s.step_number === stepNumber
          ? { ...s, status: newStatus, completed_at: newStatus === 'completed' ? new Date().toISOString() : undefined }
          : s
      ));
    } finally {
      setUpdatingStep(null);
    }
  }

  // ── Upload document ────────────────────────────────────────────────────────
  async function handleFileUpload(stepNumber: number, file: File) {
    if (!leadId || !userId) return;
    setUploadingStep(stepNumber);
    try {
      const category = uploadCategory[stepNumber] || STEPS[stepNumber - 1].uploadCategories[0].value;
      const path = `homeowner-docs/${leadId}/step-${stepNumber}/${Date.now()}-${file.name}`;

      // Upload to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from('homeowner-documents')
        .upload(path, file, { upsert: false });

      let fileUrl = '';
      if (!uploadError) {
        const { data: urlData } = supabase.storage
          .from('homeowner-documents')
          .getPublicUrl(path);
        fileUrl = urlData?.publicUrl ?? '';
      } else {
        fileUrl = `pending-upload:${path}`;
      }

      const { data: docRow, error: dbError } = await supabase
        .from('str_checklist_documents')
        .insert({
          lead_id: leadId,
          homeowner_user_id: userId,
          step_number: stepNumber,
          document_category: category,
          file_name: file.name,
          file_url: fileUrl,
          file_size_bytes: file.size,
          mime_type: file.type,
          notes: uploadNotes[stepNumber] || null,
        })
        .select()
        .single();

      if (!dbError && docRow) {
        setDocuments(prev => [docRow, ...prev]);
        const currentStep = steps.find(s => s.step_number === stepNumber);
        if (currentStep?.status === 'pending') {
          await updateStepStatus(stepNumber, 'in_progress');
        }
      }

      setUploadNotes(prev => ({ ...prev, [stepNumber]: '' }));
      if (fileInputRefs.current[stepNumber]) {
        fileInputRefs.current[stepNumber]!.value = '';
      }
    } finally {
      setUploadingStep(null);
    }
  }

  // ── Delete document ────────────────────────────────────────────────────────
  async function handleDeleteDoc(doc: UploadedDoc) {
    setDeletingDoc(doc.id);
    try {
      await supabase.from('str_checklist_documents').delete().eq('id', doc.id);
      setDocuments(prev => prev.filter(d => d.id !== doc.id));
    } finally {
      setDeletingDoc(null);
    }
  }

  // ── Derived stats ──────────────────────────────────────────────────────────
  const completedCount = steps.filter(s => s.status === 'completed').length;
  const inProgressCount = steps.filter(s => s.status === 'in_progress').length;
  const progressPct = Math.round((completedCount / 6) * 100);

  // ── Dynamic regulation guidance ────────────────────────────────────────────
  const regulation = leadCity
    ? cityRegulations.find(r => r.city.toLowerCase() === leadCity.toLowerCase())
    : null;

  function getDynamicGuidance(stepNumber: number): string | null {
    if (!regulation) return null;
    if (stepNumber === 2) {
      const parts: string[] = [];
      if (regulation.permitRequired) {
        parts.push(`⚠️ ${regulation.city} requires an STR permit/license (fee: $${regulation.licensingFee ?? 'varies'}/year). This is mandatory before going live.`);
      }
      if (regulation.primaryResidenceOnly) {
        parts.push('This city only allows STRs in primary residences — investment properties are not eligible.');
      }
      if (regulation.maxGuests) {
        parts.push(`Maximum ${regulation.maxGuests} guests allowed per booking in ${regulation.city}.`);
      }
      return parts.length > 0 ? parts.join(' ') : null;
    }
    return null;
  }

  // ── Document review status badge ───────────────────────────────────────────
  const REVIEW_BADGE: Record<string, { label: string; color: string; bg: string }> = {
    pending_review: { label: 'Pending Review', color: 'text-amber-600', bg: 'bg-amber-500/10' },
    under_review:   { label: 'Under Review',   color: 'text-blue-600',  bg: 'bg-blue-500/10'  },
    approved:       { label: 'Approved',        color: 'text-emerald-600', bg: 'bg-emerald-500/10' },
    rejected:       { label: 'Rejected',        color: 'text-red-500',  bg: 'bg-red-500/10'   },
  };

  if (loading) {
    return (
      <div className="p-4 sm:p-6 space-y-4">
        <div className="h-8 w-64 bg-muted rounded-lg animate-pulse" />
        <div className="h-4 w-48 bg-muted rounded animate-pulse" />
        <div className="grid grid-cols-3 gap-4 mt-6">
          {[1, 2, 3].map(i => <div key={i} className="h-20 bg-muted rounded-xl animate-pulse" />)}
        </div>
        {[1, 2, 3].map(i => <div key={i} className="h-24 bg-muted rounded-xl animate-pulse" />)}
      </div>
    );
  }

  if (!leadId) {
    return (
      <div className="p-4 sm:p-6 flex flex-col items-center justify-center min-h-[60vh] text-center">
        <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
          <ClipboardList size={28} className="text-muted-foreground" />
        </div>
        <h2 className="text-lg font-semibold text-foreground">No Property Linked</h2>
        <p className="text-sm text-muted-foreground mt-2 max-w-sm">
          Your account isn't linked to a property yet. Contact your TRAVLR coordinator to get set up.
        </p>
      </div>
    );
  }

  return (
    <div className="p-3 sm:p-4 md:p-6 space-y-4 sm:space-y-6 max-w-3xl mx-auto">

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg sm:text-xl font-bold text-foreground">STR-Ready Checklist</h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
            Track your property's onboarding progress from signed agreement to live listing
          </p>
        </div>
        <button
          onClick={loadData}
          className="p-2.5 sm:p-2 rounded-lg border border-border hover:bg-muted transition-all text-muted-foreground hover:text-foreground active:scale-95 touch-manipulation"
          title="Refresh"
        >
          <RefreshCw size={14} />
        </button>
      </div>

      {/* ── Progress Overview ── */}
      <div className="bg-card border border-border rounded-xl p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center">
              <Zap size={15} className="text-indigo-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Overall Progress</p>
              <p className="text-xs text-muted-foreground">Managed by TRAVLR Onboarding Coordinator</p>
            </div>
          </div>
          <span className="text-2xl font-bold text-foreground">{progressPct}%</span>
        </div>

        {/* Progress bar */}
        <div className="w-full h-2.5 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-indigo-500 to-emerald-500 rounded-full transition-all duration-700"
            style={{ width: `${progressPct}%` }}
          />
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          {[
            { label: 'Completed', value: completedCount, color: 'text-emerald-600', bg: 'bg-emerald-500/10' },
            { label: 'In Progress', value: inProgressCount, color: 'text-amber-600', bg: 'bg-amber-500/10' },
            { label: 'Remaining', value: 6 - completedCount - inProgressCount, color: 'text-muted-foreground', bg: 'bg-muted' },
          ].map(stat => (
            <div key={stat.label} className={`${stat.bg} rounded-lg p-2.5 sm:p-3 text-center`}>
              <p className={`text-xl font-bold ${stat.color}`}>{stat.value}</p>
              <p className="text-[10px] sm:text-[11px] text-muted-foreground mt-0.5">{stat.label}</p>
            </div>
          ))}
        </div>

        {/* Coordinator note */}
        <div className="flex items-start gap-2 bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800 rounded-lg p-3">
          <Info size={13} className="text-indigo-600 mt-0.5 shrink-0" />
          <p className="text-xs text-indigo-700 dark:text-indigo-300">
            Your <span className="font-semibold">TRAVLR Onboarding / Operations Coordinator</span> manages this entire process. Upload required documents below and mark steps complete as they're finished.
          </p>
        </div>
      </div>

      {/* ── Step Cards ── */}
      <div className="space-y-2.5 sm:space-y-3">
        {STEPS.map((stepDef) => {
          const stepState = steps.find(s => s.step_number === stepDef.step_number);
          const status = stepState?.status ?? 'pending';
          const statusCfg = STATUS_CONFIG[status];
          const isExpanded = expandedStep === stepDef.step_number;
          const stepDocs = documents.filter(d => d.step_number === stepDef.step_number);
          const StepIcon = stepDef.icon;
          const isUpdating = updatingStep === stepDef.step_number;
          const isUploading = uploadingStep === stepDef.step_number;
          const defaultCategory = stepDef.uploadCategories[0].value;

          return (
            <div
              key={stepDef.step_number}
              className={`bg-card border rounded-xl overflow-hidden transition-colors duration-200 ${
                status === 'completed' ? 'border-emerald-200 dark:border-emerald-800' :
                status === 'in_progress' ? 'border-amber-200 dark:border-amber-800' :
                status === 'blocked'? 'border-red-200 dark:border-red-800' : 'border-border'
              }`}
            >
              {/* Step header — touch-friendly min-height */}
              <button
                onClick={() => setExpandedStep(isExpanded ? null : stepDef.step_number)}
                className="w-full flex items-center gap-3 px-3 sm:px-4 py-4 hover:bg-muted/30 active:bg-muted/50 transition-colors text-left touch-manipulation min-h-[64px]"
              >
                {/* Step icon */}
                <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl ${stepDef.bg} border ${stepDef.border} flex items-center justify-center shrink-0`}>
                  {status === 'completed'
                    ? <CheckCircle2 size={16} className="text-emerald-600" />
                    : <StepIcon size={16} className={stepDef.color} />
                  }
                </div>

                {/* Title */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-[10px] font-bold uppercase tracking-wider ${stepDef.color}`}>
                      Step {stepDef.step_number}
                    </span>
                    <span className="text-sm font-semibold text-foreground">{stepDef.title}</span>
                    <span className="hidden sm:inline text-[10px] text-muted-foreground">{stepDef.subtitle}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full ${statusCfg.bg} ${statusCfg.color}`}>
                      {statusCfg.icon}
                      {statusCfg.label}
                    </span>
                    {stepDocs.length > 0 && (
                      <span className="text-[10px] text-muted-foreground">
                        {stepDocs.length} doc{stepDocs.length !== 1 ? 's' : ''} uploaded
                      </span>
                    )}
                  </div>
                </div>

                {/* Expand icon */}
                <div className={`transition-transform duration-300 ${isExpanded ? 'rotate-180' : 'rotate-0'}`}>
                  <ChevronDown size={15} className="text-muted-foreground shrink-0" />
                </div>
              </button>

              {/* Animated expand panel */}
              <ExpandPanel open={isExpanded}>
                <div className="border-t border-border">
                  {/* Dynamic regulation guidance */}
                  {getDynamicGuidance(stepDef.step_number) && (
                    <div className="px-3 sm:px-4 py-3 bg-amber-50 dark:bg-amber-950/30 border-b border-amber-200 dark:border-amber-800 flex items-start gap-2">
                      <Info size={13} className="text-amber-600 mt-0.5 shrink-0" />
                      <p className="text-xs text-amber-700 dark:text-amber-300 leading-relaxed">
                        {getDynamicGuidance(stepDef.step_number)}
                      </p>
                    </div>
                  )}

                  {/* Static guidance banner */}
                  <div className={`px-3 sm:px-4 py-3 ${stepDef.bg} border-b ${stepDef.border}`}>
                    <p className="text-xs text-foreground/80 leading-relaxed">{stepDef.guidance}</p>
                  </div>

                  <div className="p-3 sm:p-4 space-y-4">
                    {/* Checklist items */}
                    <div className="space-y-2">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">What happens in this step</p>
                      {stepDef.items.map((item, i) => (
                        <div key={i} className="flex items-start gap-2.5">
                          <div className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${
                            status === 'completed' ? 'bg-emerald-500' : stepDef.color.replace('text-', 'bg-')
                          }`} />
                          <p className="text-xs text-muted-foreground leading-relaxed">{item}</p>
                        </div>
                      ))}
                    </div>

                    {/* Status controls — touch-friendly buttons */}
                    <div className="space-y-2">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Update Status</p>
                      <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2">
                        {(['pending', 'in_progress', 'completed', 'blocked'] as StepStatus[]).map(s => {
                          const cfg = STATUS_CONFIG[s];
                          return (
                            <button
                              key={s}
                              onClick={() => updateStepStatus(stepDef.step_number, s)}
                              disabled={isUpdating || status === s}
                              className={`flex items-center justify-center gap-1.5 px-3 py-2.5 sm:py-1.5 rounded-lg text-xs font-medium border transition-all disabled:opacity-50 touch-manipulation active:scale-95 ${
                                status === s
                                  ? `${cfg.bg} ${cfg.color} ${cfg.border} border`
                                  : 'bg-background text-muted-foreground border-border hover:border-primary/40 hover:text-foreground'
                              }`}
                            >
                              {isUpdating && status !== s ? <Loader2 size={11} className="animate-spin" /> : cfg.icon}
                              {cfg.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Document upload — touch-friendly */}
                    <div className="space-y-3">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Upload Documents</p>

                      {/* Category selector + notes */}
                      <div className="flex flex-col sm:flex-row gap-2">
                        <select
                          value={uploadCategory[stepDef.step_number] ?? defaultCategory}
                          onChange={e => setUploadCategory(prev => ({ ...prev, [stepDef.step_number]: e.target.value }))}
                          className="text-xs px-3 py-2.5 sm:py-1.5 bg-background border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary text-foreground touch-manipulation"
                        >
                          {stepDef.uploadCategories.map(cat => (
                            <option key={cat.value} value={cat.value}>{cat.label}</option>
                          ))}
                        </select>
                        <input
                          value={uploadNotes[stepDef.step_number] ?? ''}
                          onChange={e => setUploadNotes(prev => ({ ...prev, [stepDef.step_number]: e.target.value }))}
                          placeholder="Optional note..."
                          className="flex-1 text-xs px-3 py-2.5 sm:py-1.5 bg-background border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                      </div>

                      {/* Upload button — large touch target */}
                      <label className={`flex items-center justify-center gap-2.5 w-full py-4 sm:py-3 border-2 border-dashed rounded-xl cursor-pointer transition-all font-medium touch-manipulation active:scale-[0.98] ${
                        isUploading
                          ? 'border-primary/40 bg-primary/5 text-primary cursor-not-allowed' :'border-border hover:border-primary/50 hover:bg-muted/30 text-muted-foreground hover:text-foreground active:bg-muted/50'
                      }`}>
                        {isUploading ? (
                          <>
                            <Loader2 size={18} className="animate-spin" />
                            <span className="text-sm">Uploading…</span>
                          </>
                        ) : (
                          <>
                            <Upload size={18} />
                            <span className="text-sm">Tap to Upload Document</span>
                          </>
                        )}
                        <input
                          ref={el => { fileInputRefs.current[stepDef.step_number] = el; }}
                          type="file"
                          className="hidden"
                          disabled={isUploading}
                          accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.gif,.webp,.heic,.xlsx,.csv"
                          onChange={e => {
                            const file = e.target.files?.[0];
                            if (file) handleFileUpload(stepDef.step_number, file);
                          }}
                        />
                      </label>
                      <p className="text-[10px] text-muted-foreground text-center">
                        PDF, Word, images, or spreadsheets accepted
                      </p>
                    </div>

                    {/* Uploaded documents list */}
                    {stepDocs.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Uploaded Documents</p>
                        <div className="space-y-1.5">
                          {stepDocs.map(doc => {
                            const reviewBadge = doc.review_status ? REVIEW_BADGE[doc.review_status] : null;
                            return (
                              <div key={doc.id} className={`flex items-center gap-3 px-3 py-3 rounded-lg border ${doc.review_status === 'approved' ? 'bg-emerald-500/5 border-emerald-200' : doc.review_status === 'rejected' ? 'bg-red-500/5 border-red-200' : 'bg-muted/40 border-border'}`}>
                                <div className="w-8 h-8 rounded-lg bg-card border border-border flex items-center justify-center shrink-0">
                                  {doc.review_status === 'approved'
                                    ? <CheckCircle size={14} className="text-emerald-600" />
                                    : <File size={14} className="text-muted-foreground" />
                                  }
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-medium text-foreground truncate">{doc.file_name}</p>
                                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${stepDef.badge}`}>
                                      {DOC_CATEGORY_LABELS[doc.document_category] ?? doc.document_category}
                                    </span>
                                    {reviewBadge && (
                                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${reviewBadge.bg} ${reviewBadge.color}`}>
                                        {reviewBadge.label}
                                      </span>
                                    )}
                                    {doc.file_size_bytes && (
                                      <span className="text-[10px] text-muted-foreground">{formatBytes(doc.file_size_bytes)}</span>
                                    )}
                                  </div>
                                  {doc.review_notes && (
                                    <p className="text-[10px] text-muted-foreground mt-0.5 italic">&ldquo;{doc.review_notes}&rdquo;</p>
                                  )}
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                  {doc.file_url && !doc.file_url.startsWith('pending-upload:') && (
                                    <a
                                      href={doc.file_url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors touch-manipulation"
                                      title="View file"
                                    >
                                      <ExternalLink size={13} />
                                    </a>
                                  )}
                                  {doc.review_status !== 'approved' && (
                                    <button
                                      onClick={() => handleDeleteDoc(doc)}
                                      disabled={deletingDoc === doc.id}
                                      className="p-2 rounded-lg hover:bg-red-50 text-muted-foreground hover:text-red-500 transition-colors disabled:opacity-50 touch-manipulation"
                                      title="Remove document"
                                    >
                                      {deletingDoc === doc.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </ExpandPanel>
            </div>
          );
        })}
      </div>

      {/* ── Completion Banner ── */}
      {completedCount === 6 && (
        <div className="bg-emerald-500/10 border border-emerald-300 dark:border-emerald-700 rounded-xl p-4 sm:p-5 flex items-start gap-3">
          <CheckCircle2 size={20} className="text-emerald-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">All Steps Complete — You're STR-Ready!</p>
            <p className="text-xs text-emerald-600/80 dark:text-emerald-400 mt-1">
              Your property has completed all onboarding steps. Your TRAVLR coordinator will finalize the listing launch shortly.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
