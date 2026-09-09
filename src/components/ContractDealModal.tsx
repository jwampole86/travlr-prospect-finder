'use client';

import React, { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { X, FileText, DollarSign, Calendar, CheckCircle, Loader2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';

interface ContractDealModalProps {
  leadId: string;
  leadAddress: string;
  onClose: () => void;
  onSaved: (data: { contractDate: string; contractTerms: string; monthlyRevenue: number }) => void;
  /** Pre-fill values if contract already exists */
  initialContractDate?: string;
  initialContractTerms?: string;
  initialMonthlyRevenue?: number;
}

export default function ContractDealModal({
  leadId,
  leadAddress,
  onClose,
  onSaved,
  initialContractDate = '',
  initialContractTerms = '',
  initialMonthlyRevenue,
}: ContractDealModalProps) {
  const [contractDate, setContractDate] = useState(initialContractDate);
  const [contractTerms, setContractTerms] = useState(initialContractTerms);
  const [monthlyRevenue, setMonthlyRevenue] = useState(
    initialMonthlyRevenue ? String(initialMonthlyRevenue) : ''
  );
  const [saving, setSaving] = useState(false);
  const supabase = createClient();
  const { user } = useAuth();

  async function handleSave() {
    if (!contractDate) { toast.error('Please enter the contract date'); return; }
    const revenue = parseFloat(monthlyRevenue);
    if (!monthlyRevenue || isNaN(revenue) || revenue <= 0) {
      toast.error('Please enter a valid monthly revenue amount');
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from('leads')
        .update({
          contract_date: contractDate,
          contract_terms: contractTerms.trim() || null,
          contract_monthly_revenue: revenue,
          contract_signed_at: new Date().toISOString(),
          contract_signed_by: user?.id || null,
          // Also mark deal_closed and set deal_revenue so Dashboard KPIs update
          deal_closed: true,
          deal_closed_at: new Date().toISOString(),
          deal_revenue: revenue,
          deal_notes: contractTerms.trim() || null,
        })
        .eq('id', leadId);

      if (error) throw error;

      toast.success('Contract details saved — Dashboard metrics updated');
      onSaved({ contractDate, contractTerms, monthlyRevenue: revenue });
      onClose();
    } catch (e) {
      console.error('[ContractDealModal] save error:', e);
      toast.error('Failed to save contract details');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-card border border-border rounded-2xl w-full max-w-md shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/10 flex items-center justify-center">
              <FileText size={15} className="text-emerald-600" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-foreground">Contract / Deal Details</h2>
              <p className="text-[11px] text-muted-foreground mt-0.5 truncate max-w-[220px]">{leadAddress}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
            <X size={15} className="text-muted-foreground" />
          </button>
        </div>

        {/* Info banner */}
        <div className="mx-6 mt-4 flex items-start gap-2 px-3 py-2.5 bg-emerald-500/8 border border-emerald-500/20 rounded-xl">
          <AlertTriangle size={12} className="text-emerald-600 mt-0.5 shrink-0" />
          <p className="text-[11px] text-emerald-700 dark:text-emerald-400">
            This lead is moving to <strong>Live</strong>. Enter the signed contract details below — these values will feed the Dashboard's Live Revenue and closed-deal metrics.
          </p>
        </div>

        {/* Form */}
        <div className="p-6 space-y-4">
          {/* Contract date */}
          <div>
            <label className="block text-xs font-medium text-foreground mb-1.5">
              <span className="flex items-center gap-1.5"><Calendar size={11} />Contract Date *</span>
            </label>
            <input
              type="date"
              value={contractDate}
              onChange={e => setContractDate(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-muted/50 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          {/* Monthly revenue */}
          <div>
            <label className="block text-xs font-medium text-foreground mb-1.5">
              <span className="flex items-center gap-1.5"><DollarSign size={11} />Final Monthly Revenue *</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
              <input
                type="number"
                value={monthlyRevenue}
                onChange={e => setMonthlyRevenue(e.target.value)}
                placeholder="0.00"
                min="0"
                step="0.01"
                className="w-full pl-6 pr-3 py-2 text-xs bg-muted/50 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">
              This is the agreed monthly revenue from the signed contract — used for Dashboard Live Revenue.
            </p>
          </div>

          {/* Deal terms */}
          <div>
            <label className="block text-xs font-medium text-foreground mb-1.5">
              <span className="flex items-center gap-1.5"><FileText size={11} />Deal Terms / Notes</span>
            </label>
            <textarea
              value={contractTerms}
              onChange={e => setContractTerms(e.target.value)}
              rows={3}
              placeholder="e.g. 12-month agreement, 20% management fee, starts Jan 1..."
              className="w-full px-3 py-2 text-xs bg-muted/50 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-border">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            Skip for now
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white text-xs font-medium rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50"
          >
            {saving ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle size={12} />}
            Save Contract
          </button>
        </div>
      </div>
    </div>
  );
}
