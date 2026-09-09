'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { MapPin, User, Phone, Mail, CheckCircle, Loader2, Home, AlertTriangle } from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';

interface InfoRequestData {
  lead_id: string;
  address: string;
  city: string;
  state: string;
  zip: string;
}

export default function InfoRequestPage() {
  const params = useParams();
  const router = useRouter();
  const token = params?.token as string;

  const [leadData, setLeadData] = useState<InfoRequestData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    phone: '',
    email: '',
    addressInput: '',
    addressEdited: false,
  });

  useEffect(() => {
    if (!token) return;
    // Fetch lead info tied to this token
    fetch(`/api/leads/info-request/lookup?token=${token}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) {
          setError(data.error);
        } else {
          setLeadData(data);
          setForm(f => ({ ...f, addressInput: `${data.address}, ${data.city}, ${data.state} ${data.zip}` }));
        }
      })
      .catch(() => setError('Unable to load this request. The link may have expired.'))
      .finally(() => setLoading(false));
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.firstName || !form.lastName || !form.phone || !form.email) {
      toast.error('Please fill in all fields');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/leads/info-request', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          linkToken: token,
          firstName: form.firstName,
          lastName: form.lastName,
          phone: form.phone,
          email: form.email,
          addressConfirmed: !form.addressEdited,
          addressAsSubmitted: form.addressEdited ? form.addressInput : undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSubmitted(true);
      } else {
        toast.error(data.error || 'Something went wrong. Please try again.');
      }
    } catch {
      toast.error('Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 size={24} className="animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="bg-card border border-border rounded-2xl p-8 max-w-md w-full text-center">
          <AlertTriangle size={32} className="mx-auto text-warning mb-3" />
          <h1 className="text-lg font-bold text-foreground mb-2">Link Unavailable</h1>
          <p className="text-sm text-muted-foreground">{error}</p>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Toaster position="top-center" />
        <div className="bg-card border border-border rounded-2xl p-8 max-w-md w-full text-center">
          <div className="w-14 h-14 rounded-full bg-success/10 flex items-center justify-center mx-auto mb-4">
            <CheckCircle size={28} className="text-success" />
          </div>
          <h1 className="text-xl font-bold text-foreground mb-2">Thanks! We'll be in touch.</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Your contact info has been received. A TRAVLR team member will reach out shortly to discuss your property.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Toaster position="top-center" />

      <header className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-40">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <Home size={16} className="text-primary-foreground" />
          </div>
          <div>
            <p className="text-sm font-bold text-foreground">TRAVLR Vacation Homes</p>
            <p className="text-[10px] text-muted-foreground">Property Contact Confirmation</p>
          </div>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-8 space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-foreground mb-2">Confirm Your Contact Info</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            A TRAVLR team member reached out about your property. Confirm your details below and we'll follow up directly.
          </p>
        </div>

        {/* Property address confirmation */}
        {leadData && (
          <div className="bg-muted/40 border border-border rounded-xl p-4">
            <div className="flex items-start gap-3">
              <MapPin size={16} className="text-primary shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-muted-foreground mb-1">Property Address</p>
                <input
                  value={form.addressInput}
                  onChange={e => setForm(f => ({ ...f, addressInput: e.target.value, addressEdited: true }))}
                  className="w-full text-sm font-medium text-foreground bg-transparent border-0 outline-none focus:ring-0 p-0"
                />
                {form.addressEdited && (
                  <p className="text-[11px] text-warning mt-1 flex items-center gap-1">
                    <AlertTriangle size={10} />
                    Address edited — our team will review
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-foreground mb-1.5">First Name</label>
              <div className="relative">
                <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={form.firstName}
                  onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))}
                  placeholder="Jane"
                  className="w-full pl-9 pr-3 py-2.5 text-sm bg-background border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                  required
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground mb-1.5">Last Name</label>
              <input
                value={form.lastName}
                onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))}
                placeholder="Smith"
                className="w-full px-3 py-2.5 text-sm bg-background border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-foreground mb-1.5">Phone Number</label>
            <div className="relative">
              <Phone size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="tel"
                value={form.phone}
                onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                placeholder="(555) 000-0000"
                className="w-full pl-9 pr-3 py-2.5 text-sm bg-background border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-foreground mb-1.5">Email Address</label>
            <div className="relative">
              <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="email"
                value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                placeholder="jane@example.com"
                className="w-full pl-9 pr-3 py-2.5 text-sm bg-background border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                required
              />
            </div>
          </div>

          <p className="text-[11px] text-muted-foreground leading-relaxed">
            By submitting, you agree TRAVLR may contact you about this property. Your info is subject to our{' '}
            <a href="/privacy-policy" className="text-primary hover:underline">Privacy Policy</a>.
            You may opt out at any time.
          </p>

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {submitting ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle size={16} />}
            {submitting ? 'Submitting…' : 'Confirm My Info'}
          </button>
        </form>
      </main>
    </div>
  );
}
