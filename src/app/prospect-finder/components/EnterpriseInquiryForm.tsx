'use client';

import { useState } from 'react';
import { Loader2, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';

interface FormState {
  firstName: string;
  lastName: string;
  workEmail: string;
  company: string;
  companyWebsite: string;
  propertiesManaged: string;
  teamMembers: string;
  currentSoftware: string;
  primaryUseCase: string;
  estimatedLeadVolume: string;
  message: string;
}

const initialState: FormState = {
  firstName: '', lastName: '', workEmail: '', company: '', companyWebsite: '',
  propertiesManaged: '', teamMembers: '', currentSoftware: '', primaryUseCase: '',
  estimatedLeadVolume: '', message: '',
};

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide">
        {label} {required && <span className="text-danger">*</span>}
      </label>
      {children}
    </div>
  );
}

const inputClass = 'w-full px-3 py-2.5 rounded-xl border border-input bg-background text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent';

export default function EnterpriseInquiryForm() {
  const [form, setForm] = useState<FormState>(initialState);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const set = (key: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.firstName.trim() || !form.lastName.trim() || !form.workEmail.trim() || !form.company.trim()) {
      toast.error('Please fill in all required fields');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/prospect-finder/enterprise-inquiry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Something went wrong');
      setSubmitted(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to submit your request. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="bg-card border border-border rounded-2xl p-8 text-center">
        <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
          <CheckCircle className="w-6 h-6 text-primary" />
        </div>
        <h2 className="text-lg font-bold text-foreground mb-1.5">Thanks — we've got your request</h2>
        <p className="text-sm text-muted-foreground">A member of our sales team will reach out to {form.workEmail} shortly to discuss VAYO Enterprise.</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="bg-card border border-border rounded-2xl p-6 sm:p-8 space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="First Name" required><input className={inputClass} value={form.firstName} onChange={set('firstName')} required /></Field>
        <Field label="Last Name" required><input className={inputClass} value={form.lastName} onChange={set('lastName')} required /></Field>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Work Email" required><input type="email" className={inputClass} value={form.workEmail} onChange={set('workEmail')} required /></Field>
        <Field label="Company" required><input className={inputClass} value={form.company} onChange={set('company')} required /></Field>
      </div>
      <Field label="Company Website"><input type="url" placeholder="https://" className={inputClass} value={form.companyWebsite} onChange={set('companyWebsite')} /></Field>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Number of Properties Managed"><input className={inputClass} value={form.propertiesManaged} onChange={set('propertiesManaged')} /></Field>
        <Field label="Number of Team Members"><input className={inputClass} value={form.teamMembers} onChange={set('teamMembers')} /></Field>
      </div>
      <Field label="Current Vacation Rental Software / PMS"><input className={inputClass} value={form.currentSoftware} onChange={set('currentSoftware')} /></Field>
      <Field label="Primary Use Case"><input className={inputClass} value={form.primaryUseCase} onChange={set('primaryUseCase')} /></Field>
      <Field label="Estimated Lead Volume"><input className={inputClass} value={form.estimatedLeadVolume} onChange={set('estimatedLeadVolume')} /></Field>
      <Field label="Message"><textarea rows={4} className={`${inputClass} resize-none`} value={form.message} onChange={set('message')} /></Field>

      <button
        type="submit"
        disabled={submitting}
        className="w-full py-3.5 px-6 bg-foreground text-background rounded-xl font-semibold text-sm hover:opacity-90 transition-opacity flex items-center justify-center gap-2 disabled:opacity-60"
      >
        {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
        {submitting ? 'Submitting…' : 'Request Enterprise Access'}
      </button>
    </form>
  );
}
