'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useSearchParams } from 'next/navigation';
import {
  Home, Shield, MapPin, DollarSign, Phone, CheckCircle2, ChevronRight,
  ChevronLeft, AlertCircle, Loader2, Save, Info
} from 'lucide-react';
import { toast } from 'sonner';
import Icon from '@/components/ui/AppIcon';


interface RegulationRule {
  id: string;
  state: string;
  city: string | null;
  rule_key: string;
  rule_label: string;
  rule_description: string | null;
  rule_type: string;
  rule_options: string[] | null;
  is_required: boolean;
  is_verified: boolean;
  verification_notes: string | null;
  display_order: number;
}

interface QuestionnaireData {
  id: string;
  lead_id: string;
  unique_token: string;
  questionnaire_status: string;
  qualification_result: string | null;
  qualification_reasons: string[];
  confirmed_address: string | null;
  property_type: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  current_occupancy: string | null;
  has_hoa: boolean | null;
  hoa_allows_str: boolean | null;
  has_smoke_detectors: boolean | null;
  has_co_detectors: boolean | null;
  has_fire_extinguisher: boolean | null;
  has_working_locks: boolean | null;
  has_safe_egress: boolean | null;
  has_pool_safety_compliance: boolean | null;
  known_hazards: string | null;
  safety_notes: string | null;
  regulation_responses: Record<string, unknown>;
  furnishing_status: string | null;
  current_availability: string | null;
  has_existing_lease: boolean | null;
  desired_start_date: string | null;
  personal_use_restrictions: string | null;
  preferred_contact_method: string | null;
  best_contact_time: string | null;
  additional_info: string | null;
  prefilled_address: string | null;
  prefilled_state: string | null;
  prefilled_city: string | null;
  homeowner_email: string | null;
  homeowner_name: string | null;
  submitted_at: string | null;
}

const SECTIONS = [
  { id: 'A', label: 'Property Basics', icon: Home },
  { id: 'B', label: 'Safety & Compliance', icon: Shield },
  { id: 'C', label: 'Local Regulations', icon: MapPin },
  { id: 'D', label: 'Revenue & Availability', icon: DollarSign },
  { id: 'E', label: 'Contact', icon: Phone },
];

const UNVERIFIED_STATES = ['FL', 'UT', 'ME', 'OR', 'MA', 'MD'];

function YesNoField({ label, description, value, onChange }: {
  label: string; description?: string; value: boolean | null; onChange: (v: boolean) => void;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium text-foreground">{label}</label>
      {description && <p className="text-xs text-muted-foreground">{description}</p>}
      <div className="flex gap-2">
        {[true, false].map(v => (
          <button
            key={String(v)}
            type="button"
            onClick={() => onChange(v)}
            className={`flex-1 py-2.5 text-sm rounded-lg border font-medium transition-colors ${
              value === v
                ? v ? 'bg-success/10 text-success border-success/30' : 'bg-danger/10 text-danger border-danger/30' :'border-border text-muted-foreground hover:border-primary/30'
            }`}
          >
            {v ? 'Yes' : 'No'}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function QuestionnairePublicPage() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const supabase = createClient();

  const [questionnaire, setQuestionnaire] = useState<QuestionnaireData | null>(null);
  const [regulationRules, setRegulationRules] = useState<RegulationRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [currentSection, setCurrentSection] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const [formData, setFormData] = useState<Partial<QuestionnaireData>>({});
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!token) { setLoading(false); setNotFound(true); return; }
    const fetchQuestionnaire = async () => {
      const { data, error } = await supabase
        .from('homeowner_questionnaires')
        .select('*')
        .eq('unique_token', token)
        .maybeSingle();
      if (error || !data) { setNotFound(true); setLoading(false); return; }
      setQuestionnaire(data);
      setFormData(data);
      if (data.submitted_at) setSubmitted(true);

      // Load regulation rules for this state/city
      if (data.prefilled_state) {
        const { data: rules } = await supabase
          .from('regulation_rules')
          .select('*')
          .eq('state', data.prefilled_state)
          .eq('is_active', true)
          .order('display_order');
        if (rules) setRegulationRules(rules);
      }
      setLoading(false);
    };
    fetchQuestionnaire();
  }, [token, supabase]);

  const updateField = useCallback(<K extends keyof QuestionnaireData>(key: K, value: QuestionnaireData[K]) => {
    setFormData(prev => ({ ...prev, [key]: value }));
  }, []);

  const handleSave = useCallback(async () => {
    if (!questionnaire?.id) return;
    setSaving(true);
    const { error } = await supabase
      .from('homeowner_questionnaires')
      .update({
        ...formData,
        questionnaire_status: 'in_progress',
        last_saved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', questionnaire.id);
    if (error) toast.error('Failed to save progress');
    else toast.success('Progress saved');
    setSaving(false);
  }, [questionnaire, formData, supabase]);

  const calculateQualification = useCallback((data: Partial<QuestionnaireData>) => {
    const reasons: string[] = [];
    let result: 'qualified' | 'needs_review' | 'not_a_fit' = 'qualified';

    // Safety checks
    const safetyIssues: string[] = [];
    if (data.has_smoke_detectors === false) safetyIssues.push('Missing smoke detectors');
    if (data.has_co_detectors === false) safetyIssues.push('Missing CO detectors');
    if (data.has_fire_extinguisher === false) safetyIssues.push('Missing fire extinguisher');
    if (data.has_working_locks === false) safetyIssues.push('Working locks required');
    if (data.has_safe_egress === false) safetyIssues.push('Safe egress from bedrooms required');
    if (data.known_hazards) safetyIssues.push(`Known hazards: ${data.known_hazards}`);

    if (safetyIssues.length > 2) {
      result = 'not_a_fit';
      reasons.push(...safetyIssues.map(s => `Safety issue: ${s}`));
    } else if (safetyIssues.length > 0) {
      result = 'needs_review';
      reasons.push(...safetyIssues.map(s => `Fixable safety issue: ${s}`));
    }

    // HOA check
    if (data.has_hoa === true && data.hoa_allows_str === false) {
      result = 'not_a_fit';
      reasons.push('HOA prohibits short-term rentals');
    } else if (data.has_hoa === true && data.hoa_allows_str === null) {
      if (result === 'qualified') result = 'needs_review';
      reasons.push('HOA STR permission needs confirmation');
    }

    // Furnishing
    if (data.furnishing_status === 'unfurnished') {
      if (result === 'qualified') result = 'needs_review';
      reasons.push('Property is unfurnished — furnishing required before launch');
    }

    if (reasons.length === 0) {
      reasons.push('All qualification criteria met');
    }

    return { result, reasons };
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!questionnaire?.id) return;
    setSubmitting(true);

    const { result, reasons } = calculateQualification(formData);

    const { error } = await supabase
      .from('homeowner_questionnaires')
      .update({
        ...formData,
        questionnaire_status: result === 'qualified' ? 'qualified' : result === 'needs_review' ? 'needs_review' : 'not_a_fit',
        qualification_result: result,
        qualification_reasons: reasons,
        submitted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', questionnaire.id);

    if (error) { toast.error('Failed to submit'); setSubmitting(false); return; }
    setSubmitted(true);
    setSubmitting(false);
  }, [questionnaire, formData, calculateQualification, supabase]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="text-center max-w-md">
          <AlertCircle size={40} className="text-warning mx-auto mb-4" />
          <h1 className="text-xl font-bold text-foreground mb-2">Questionnaire Not Found</h1>
          <p className="text-sm text-muted-foreground">This link may be invalid or expired. Please contact your TRAVLR agent for a new link.</p>
        </div>
      </div>
    );
  }

  if (submitted) {
    let result = formData.qualification_result;
    return (
      <div className="min-h-screen bg-background p-4 flex items-center justify-center">
        <div className="max-w-lg w-full bg-card border border-border rounded-2xl p-8 text-center">
          <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${
            result === 'qualified' ? 'bg-success/10' : result === 'needs_review' ? 'bg-warning/10' : 'bg-muted'
          }`}>
            <CheckCircle2 size={28} className={result === 'qualified' ? 'text-success' : result === 'needs_review' ? 'text-warning' : 'text-muted-foreground'} />
          </div>
          <h1 className="text-xl font-bold text-foreground mb-2">Thank You!</h1>
          <p className="text-sm text-muted-foreground mb-4">Your questionnaire has been submitted successfully.</p>
          {result === 'qualified' && (
            <div className="bg-success/10 border border-success/20 rounded-xl p-4 mb-4">
              <p className="text-sm font-semibold text-success">Great news — your property looks like a strong fit!</p>
              <p className="text-xs text-muted-foreground mt-1">Your TRAVLR agent will follow up within 1–2 business days.</p>
            </div>
          )}
          {result === 'needs_review' && (
            <div className="bg-warning/10 border border-warning/20 rounded-xl p-4 mb-4">
              <p className="text-sm font-semibold text-warning">Your submission is under review.</p>
              <p className="text-xs text-muted-foreground mt-1">Your TRAVLR agent will follow up within 1–2 business days to discuss next steps.</p>
            </div>
          )}
          {result === 'not_a_fit' && (
            <div className="bg-muted border border-border rounded-xl p-4 mb-4">
              <p className="text-sm font-semibold text-foreground">Thank you for your interest.</p>
              <p className="text-xs text-muted-foreground mt-1">Based on your responses, we may not be the right fit at this time. Your TRAVLR agent will be in touch to explain further.</p>
            </div>
          )}
          <div className="text-left bg-muted/50 rounded-xl p-4">
            <p className="text-xs font-semibold text-muted-foreground mb-2">Your Responses Summary</p>
            <div className="space-y-1 text-xs text-muted-foreground">
              {formData.confirmed_address && <p>📍 {formData.confirmed_address}</p>}
              {formData.property_type && <p>🏠 {formData.property_type}</p>}
              {formData.bedrooms && <p>🛏 {formData.bedrooms} bed / {formData.bathrooms} bath</p>}
              {formData.furnishing_status && <p>🛋 {formData.furnishing_status.replace(/_/g, ' ')}</p>}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const section = SECTIONS[currentSection];
  const SectionIcon = section.icon;
  const state = formData.prefilled_state || '';
  const city = formData.prefilled_city || '';
  const isUnverifiedState = UNVERIFIED_STATES.includes(state);
  const cityRules = regulationRules.filter(r => r.city?.toLowerCase() === city.toLowerCase());
  const stateRules = regulationRules.filter(r => !r.city);
  const applicableRules = cityRules.length > 0 ? cityRules : stateRules;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-primary text-white px-4 py-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest opacity-80">TRAVLR</p>
            <h1 className="text-lg font-bold">Property Qualification</h1>
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white/20 hover:bg-white/30 rounded-lg text-sm transition-colors"
          >
            {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
            Save
          </button>
        </div>
      </div>

      {/* Progress */}
      <div className="bg-card border-b border-border px-4 py-3">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center gap-1 overflow-x-auto pb-1">
            {SECTIONS.map((s, i) => {
              const Icon = s.icon;
              return (
                <button
                  key={s.id}
                  onClick={() => setCurrentSection(i)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                    i === currentSection ? 'bg-primary text-white' : i < currentSection ? 'bg-success/10 text-success' : 'text-muted-foreground hover:bg-muted'
                  }`}
                >
                  <Icon size={12} />
                  <span className="hidden sm:inline">Section {s.id}:</span> {s.label}
                </button>
              );
            })}
          </div>
          <div className="mt-2 h-1 bg-muted rounded-full overflow-hidden">
            <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${((currentSection + 1) / SECTIONS.length) * 100}%` }} />
          </div>
        </div>
      </div>

      {/* Form Content */}
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center gap-2 mb-2">
          <SectionIcon size={18} className="text-primary" />
          <h2 className="text-lg font-bold text-foreground">Section {section.id}: {section.label}</h2>
        </div>

        {/* Section A: Property Basics */}
        {currentSection === 0 && (
          <div className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Property Address</label>
              <p className="text-xs text-muted-foreground mb-2">Please confirm or correct the address below.</p>
              <input
                type="text"
                value={formData.confirmed_address || formData.prefilled_address || ''}
                onChange={e => updateField('confirmed_address', e.target.value)}
                placeholder="123 Main St, City, State ZIP"
                className="w-full px-3 py-2.5 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-ring/30"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Property Type</label>
              <div className="grid grid-cols-2 gap-2">
                {['Condo', 'Single-family home', 'Townhouse', 'Other'].map(type => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => updateField('property_type', type)}
                    className={`py-2.5 text-sm rounded-lg border font-medium transition-colors ${formData.property_type === type ? 'bg-primary/10 text-primary border-primary/30' : 'border-border text-muted-foreground hover:border-primary/30'}`}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Bedrooms</label>
                <input type="number" min={0} max={20} value={formData.bedrooms || ''} onChange={e => updateField('bedrooms', parseInt(e.target.value) || null)} className="w-full px-3 py-2.5 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-ring/30" placeholder="e.g. 3" />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Bathrooms</label>
                <input type="number" min={0} max={20} step={0.5} value={formData.bathrooms || ''} onChange={e => updateField('bathrooms', parseFloat(e.target.value) || null)} className="w-full px-3 py-2.5 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-ring/30" placeholder="e.g. 2" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Current Occupancy</label>
              <div className="space-y-2">
                {[
                  { value: 'owner_occupied', label: 'Owner occupied' },
                  { value: 'vacant', label: 'Vacant' },
                  { value: 'long_term_leased', label: 'Long-term leased' },
                ].map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => updateField('current_occupancy', opt.value as QuestionnaireData['current_occupancy'])}
                    className={`w-full py-2.5 px-4 text-sm rounded-lg border text-left font-medium transition-colors ${formData.current_occupancy === opt.value ? 'bg-primary/10 text-primary border-primary/30' : 'border-border text-muted-foreground hover:border-primary/30'}`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            <YesNoField
              label="Is there an HOA or condo association?"
              value={formData.has_hoa ?? null}
              onChange={v => updateField('has_hoa', v)}
            />
            {formData.has_hoa === true && (
              <YesNoField
                label="Does your HOA/condo association permit short-term rentals?"
                description="Check your HOA bylaws or contact your association to confirm."
                value={formData.hoa_allows_str ?? null}
                onChange={v => updateField('hoa_allows_str', v)}
              />
            )}
          </div>
        )}

        {/* Section B: Safety & Compliance */}
        {currentSection === 1 && (
          <div className="space-y-5">
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start gap-2">
              <Info size={14} className="text-blue-600 shrink-0 mt-0.5" />
              <p className="text-xs text-blue-700">These safety items are required for all short-term rental properties. Most can be addressed before launch if not already in place.</p>
            </div>
            <YesNoField label="Smoke detectors installed in required areas?" value={formData.has_smoke_detectors ?? null} onChange={v => updateField('has_smoke_detectors', v)} />
            <YesNoField label="Carbon monoxide detectors installed where applicable?" description="Required in sleeping areas and near attached garages." value={formData.has_co_detectors ?? null} onChange={v => updateField('has_co_detectors', v)} />
            <YesNoField label="Fire extinguisher on-site?" value={formData.has_fire_extinguisher ?? null} onChange={v => updateField('has_fire_extinguisher', v)} />
            <YesNoField label="Working locks on all exterior doors and windows?" value={formData.has_working_locks ?? null} onChange={v => updateField('has_working_locks', v)} />
            <YesNoField
              label="Safe egress from every bedroom?"
              description="Egress means a safe, direct way to exit a room during an emergency — typically a door or window large enough to escape through."
              value={formData.has_safe_egress ?? null}
              onChange={v => updateField('has_safe_egress', v)}
            />
            <YesNoField
              label="Pool, hot tub, or water feature requiring safety fencing/compliance?"
              value={formData.has_pool_safety_compliance ?? null}
              onChange={v => updateField('has_pool_safety_compliance', v)}
            />
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Known hazards?</label>
              <p className="text-xs text-muted-foreground mb-2">Examples: exposed wiring, structural problems, mold, etc. Leave blank if none.</p>
              <textarea
                value={formData.known_hazards || ''}
                onChange={e => updateField('known_hazards', e.target.value || null)}
                rows={3}
                placeholder="Describe any known hazards..."
                className="w-full px-3 py-2.5 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-ring/30 resize-none"
              />
            </div>
          </div>
        )}

        {/* Section C: Location-Specific Regulations */}
        {currentSection === 2 && (
          <div className="space-y-5">
            {isUnverifiedState ? (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
                <div className="flex items-start gap-3">
                  <AlertCircle size={16} className="text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-amber-800">Regulatory Research In Progress</p>
                    <p className="text-xs text-amber-700 mt-1">
                      We are currently conducting dedicated regulatory research for {state} to ensure we provide accurate, verified information.
                      We will not present unverified generic regulation questions for this state.
                      Your TRAVLR agent will discuss local requirements with you directly.
                    </p>
                  </div>
                </div>
              </div>
            ) : applicableRules.length > 0 ? (
              <>
                <p className="text-sm text-muted-foreground">
                  The following questions are specific to {city || state} regulations.
                  {applicableRules.some(r => !r.is_verified) && (
                    <span className="text-warning"> Some rules are pending verification — your agent will confirm details.</span>
                  )}
                </p>
                {applicableRules.map(rule => (
                  <div key={rule.id} className="space-y-2">
                    {rule.rule_type === 'boolean' && (
                      <YesNoField
                        label={rule.rule_label}
                        description={rule.rule_description || undefined}
                        value={(formData.regulation_responses?.[rule.rule_key] as boolean) ?? null}
                        onChange={v => updateField('regulation_responses', { ...formData.regulation_responses, [rule.rule_key]: v })}
                      />
                    )}
                    {rule.rule_type === 'select' && rule.rule_options && (
                      <div>
                        <label className="block text-sm font-medium text-foreground mb-1.5">{rule.rule_label}</label>
                        {rule.rule_description && <p className="text-xs text-muted-foreground mb-2">{rule.rule_description}</p>}
                        <div className="space-y-2">
                          {rule.rule_options.map(opt => (
                            <button
                              key={opt}
                              type="button"
                              onClick={() => updateField('regulation_responses', { ...formData.regulation_responses, [rule.rule_key]: opt })}
                              className={`w-full py-2.5 px-4 text-sm rounded-lg border text-left font-medium transition-colors ${formData.regulation_responses?.[rule.rule_key] === opt ? 'bg-primary/10 text-primary border-primary/30' : 'border-border text-muted-foreground hover:border-primary/30'}`}
                            >
                              {opt}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    {!rule.is_verified && (
                      <p className="text-[11px] text-warning flex items-center gap-1">
                        <AlertCircle size={10} /> Pending verification — your agent will confirm
                      </p>
                    )}
                  </div>
                ))}
              </>
            ) : (
              <div className="bg-muted/50 border border-border rounded-xl p-5 text-center">
                <MapPin size={24} className="text-muted-foreground mx-auto mb-2" />
                <p className="text-sm font-medium text-foreground">No location-specific questions available</p>
                <p className="text-xs text-muted-foreground mt-1">Your TRAVLR agent will discuss local STR requirements with you directly.</p>
              </div>
            )}
          </div>
        )}

        {/* Section D: Revenue & Availability */}
        {currentSection === 3 && (
          <div className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Furnishing Status</label>
              <div className="space-y-2">
                {[
                  { value: 'fully_furnished', label: 'Fully furnished' },
                  { value: 'partially_furnished', label: 'Partially furnished' },
                  { value: 'unfurnished', label: 'Unfurnished' },
                ].map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => updateField('furnishing_status', opt.value as QuestionnaireData['furnishing_status'])}
                    className={`w-full py-2.5 px-4 text-sm rounded-lg border text-left font-medium transition-colors ${formData.furnishing_status === opt.value ? 'bg-primary/10 text-primary border-primary/30' : 'border-border text-muted-foreground hover:border-primary/30'}`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            <YesNoField label="Is there an existing lease or tenant?" value={formData.has_existing_lease ?? null} onChange={v => updateField('has_existing_lease', v)} />
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Desired Partnership Start Date</label>
              <input
                type="date"
                value={formData.desired_start_date || ''}
                onChange={e => updateField('desired_start_date', e.target.value || null)}
                className="w-full px-3 py-2.5 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-ring/30"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Personal Use Restrictions / Block-out Dates</label>
              <p className="text-xs text-muted-foreground mb-2">Are there dates you need the property for personal use?</p>
              <textarea
                value={formData.personal_use_restrictions || ''}
                onChange={e => updateField('personal_use_restrictions', e.target.value || null)}
                rows={3}
                placeholder="e.g. Christmas week, summer vacation..."
                className="w-full px-3 py-2.5 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-ring/30 resize-none"
              />
            </div>
          </div>
        )}

        {/* Section E: Contact */}
        {currentSection === 4 && (
          <div className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Your Name</label>
              <input type="text" value={formData.homeowner_name || ''} onChange={e => updateField('homeowner_name', e.target.value || null)} placeholder="Jane Smith" className="w-full px-3 py-2.5 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-ring/30" />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Email Address</label>
              <input type="email" value={formData.homeowner_email || ''} onChange={e => updateField('homeowner_email', e.target.value || null)} placeholder="jane@email.com" className="w-full px-3 py-2.5 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-ring/30" />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Preferred Contact Method</label>
              <div className="flex gap-2">
                {['email', 'phone', 'text'].map(method => (
                  <button
                    key={method}
                    type="button"
                    onClick={() => updateField('preferred_contact_method', method as QuestionnaireData['preferred_contact_method'])}
                    className={`flex-1 py-2.5 text-sm rounded-lg border font-medium capitalize transition-colors ${formData.preferred_contact_method === method ? 'bg-primary/10 text-primary border-primary/30' : 'border-border text-muted-foreground hover:border-primary/30'}`}
                  >
                    {method}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Best Time to Contact</label>
              <input type="text" value={formData.best_contact_time || ''} onChange={e => updateField('best_contact_time', e.target.value || null)} placeholder="e.g. Weekday mornings, after 5pm..." className="w-full px-3 py-2.5 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-ring/30" />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Anything else you&apos;d like us to know? (Optional)</label>
              <textarea value={formData.additional_info || ''} onChange={e => updateField('additional_info', e.target.value || null)} rows={4} className="w-full px-3 py-2.5 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-ring/30 resize-none" />
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="flex items-center justify-between pt-4 border-t border-border">
          <button
            onClick={() => setCurrentSection(s => Math.max(0, s - 1))}
            disabled={currentSection === 0}
            className="flex items-center gap-2 px-4 py-2.5 text-sm border border-border rounded-lg hover:bg-muted transition-colors disabled:opacity-40"
          >
            <ChevronLeft size={14} /> Previous
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2.5 text-sm border border-border rounded-lg hover:bg-muted transition-colors"
            >
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
              Save Progress
            </button>
            {currentSection < SECTIONS.length - 1 ? (
              <button
                onClick={() => setCurrentSection(s => Math.min(SECTIONS.length - 1, s + 1))}
                className="flex items-center gap-2 px-4 py-2.5 text-sm bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
              >
                Next <ChevronRight size={14} />
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="flex items-center gap-2 px-4 py-2.5 text-sm bg-success text-white rounded-lg hover:bg-success/90 transition-colors disabled:opacity-60"
              >
                {submitting ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
                Submit
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
