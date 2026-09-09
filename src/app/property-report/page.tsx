'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import AppLayout from '@/components/AppLayout';
import { createClient } from '@/lib/supabase/client';
import { useChat } from '@/lib/hooks/useChat';
import { cityRegulations } from '@/data/regulations';
import { FileText, Download, AlertCircle, CheckCircle2, DollarSign, TrendingUp, Shield, ChevronDown, ChevronRight, Mail, Star, Info, AlertTriangle, BarChart2, Loader2, Printer } from 'lucide-react';
import { toast } from 'sonner';


interface Lead {
  id: string;
  address: string;
  city: string;
  state: string;
  zip_code?: string;
  property_type?: string;
  portfolio?: string;
  contact_name?: string;
  beds?: number;
  baths?: number;
  price?: number;
}

interface PropertyReport {
  id: string;
  lead_id: string;
  report_status: string;
  property_address: string;
  property_type: string;
  portfolio: string;
  city: string;
  state: string;
  revenue_summary: string;
  estimated_adr: number;
  estimated_occupancy_rate: number;
  gross_monthly_revenue: number;
  net_monthly_revenue: number;
  projected_annual_net: number;
  monthly_roi: number;
  lease_acquisition_cost: number;
  adr_assumption: string;
  occupancy_assumption: string;
  cost_assumptions: Record<string, unknown>;
  ai_narrative: string;
  regulation_summary: string;
  regulation_source: string;
  missing_inputs: string[];
  generated_at: string;
  pdf_url: string | null;
}

interface ReportAssumptions {
  estimatedADR: string;
  estimatedOccupancy: string;
  leaseAcquisitionCost: string;
  managementFeePercent: string;
  cleaningCostPerStay: string;
  platformFeePercent: string;
}

const DEFAULT_ASSUMPTIONS: ReportAssumptions = {
  estimatedADR: '',
  estimatedOccupancy: '',
  leaseAcquisitionCost: '',
  managementFeePercent: '20',
  cleaningCostPerStay: '150',
  platformFeePercent: '3',
};

function EstimateTag() {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 border border-amber-200 font-medium">
      <Info size={9} /> Estimate
    </span>
  );
}

function MetricCard({ label, value, sub, isEstimate = false, missing = false }: {
  label: string; value: string; sub?: string; isEstimate?: boolean; missing?: boolean;
}) {
  return (
    <div className={`bg-card border rounded-xl p-4 ${missing ? 'border-warning/30 bg-warning/5' : 'border-border'}`}>
      <div className="flex items-center justify-between mb-1">
        <p className="text-xs text-muted-foreground">{label}</p>
        {isEstimate && !missing && <EstimateTag />}
        {missing && <span className="text-[10px] text-warning font-medium">Input needed</span>}
      </div>
      <p className={`text-xl font-bold ${missing ? 'text-muted-foreground' : 'text-foreground'}`}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

/**
 * Triggers the browser print dialog scoped to the #property-report element.
 * The global print CSS (injected below) hides everything except that element,
 * so "Save as PDF" in the print dialog produces a clean single-report PDF.
 */
function triggerPDFExport(reportAddress: string): void {
  // Inject print-scoped CSS once
  const STYLE_ID = 'travlr-print-styles';
  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      @media print {
        body > * { display: none !important; }
        #travlr-print-root,
        #travlr-print-root * { display: revert !important; }
        #travlr-print-root {
          position: fixed;
          inset: 0;
          background: white;
          padding: 24px;
          font-family: system-ui, sans-serif;
          font-size: 12px;
          color: #111;
          z-index: 99999;
        }
        .print-hide { display: none !important; }
        .print-page-break { page-break-before: always; }
      }
    `;
    document.head.appendChild(style);
  }

  // Build a minimal print root from the existing report DOM
  const reportEl = document.getElementById('property-report');
  if (!reportEl) {
    toast.error('Report not found — please generate the report first');
    return;
  }

  // Remove any previous print root
  const existing = document.getElementById('travlr-print-root');
  if (existing) existing.remove();

  const printRoot = document.createElement('div');
  printRoot.id = 'travlr-print-root';

  // Header
  const header = document.createElement('div');
  header.style.cssText = 'background:#1d4ed8;color:white;padding:20px 24px;border-radius:8px;margin-bottom:20px;';
  header.innerHTML = `
    <div style="font-size:10px;font-weight:600;letter-spacing:0.1em;opacity:0.8;text-transform:uppercase;margin-bottom:4px;">TRAVLR Property Report</div>
    <div style="font-size:20px;font-weight:700;">${reportAddress}</div>
    <div style="font-size:12px;opacity:0.8;margin-top:4px;">Generated ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
  `;
  printRoot.appendChild(header);

  // Clone report content
  const clone = reportEl.cloneNode(true) as HTMLElement;
  // Remove the TRAVLR header block (already re-rendered above) and action buttons
  const firstChild = clone.firstElementChild;
  if (firstChild) clone.removeChild(firstChild);
  clone.style.cssText = 'font-size:12px;';
  printRoot.appendChild(clone);

  // Disclaimer footer
  const footer = document.createElement('div');
  footer.style.cssText = 'margin-top:16px;padding:12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;font-size:10px;color:#64748b;line-height:1.5;';
  footer.textContent = 'All financial projections are estimates based on market assumptions and are not guarantees of future performance. Regulatory information should be independently verified with local authorities.';
  printRoot.appendChild(footer);

  document.body.appendChild(printRoot);

  // Trigger print then clean up
  setTimeout(() => {
    window.print();
    setTimeout(() => {
      const root = document.getElementById('travlr-print-root');
      if (root) root.remove();
    }, 1000);
  }, 100);
}

export default function PropertyReportPage() {
  const supabase = createClient();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [selectedLeadId, setSelectedLeadId] = useState('');
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [report, setReport] = useState<PropertyReport | null>(null);
  const [assumptions, setAssumptions] = useState<ReportAssumptions>(DEFAULT_ASSUMPTIONS);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [exportingPDF, setExportingPDF] = useState(false);
  const [showAssumptions, setShowAssumptions] = useState(false);
  const [missingInputs, setMissingInputs] = useState<string[]>([]);

  const { response: aiResponse, isLoading: aiLoading, error: aiError, sendMessage } = useChat('OPEN_AI', 'gpt-4o-mini', false);

  useEffect(() => {
    if (aiError) toast.error(aiError.message);
  }, [aiError]);

  useEffect(() => {
    const fetchLeads = async () => {
      const { data } = await supabase
        .from('leads')
        .select('id, address, city, state, zip_code, property_type, portfolio, contact_name, beds, baths, price')
        .not('address', 'is', null)
        .order('created_at', { ascending: false })
        .limit(100);
      if (data) setLeads(data);
    };
    fetchLeads();
  }, [supabase]);

  useEffect(() => {
    if (!selectedLeadId) { setSelectedLead(null); setReport(null); return; }
    const lead = leads.find(l => l.id === selectedLeadId) || null;
    setSelectedLead(lead);
    // Load existing report
    const fetchReport = async () => {
      const { data } = await supabase
        .from('property_reports')
        .select('*')
        .eq('lead_id', selectedLeadId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data) setReport(data);
      else setReport(null);
    };
    fetchReport();
  }, [selectedLeadId, leads, supabase]);

  const validateAssumptions = useCallback(() => {
    const missing: string[] = [];
    if (!assumptions.estimatedADR) missing.push('Estimated ADR');
    if (!assumptions.estimatedOccupancy) missing.push('Estimated Occupancy Rate');
    if (!assumptions.leaseAcquisitionCost) missing.push('Lease/Acquisition Cost');
    setMissingInputs(missing);
    return missing;
  }, [assumptions]);

  const getRegulationInfo = useCallback((city: string, state: string) => {
    const reg = cityRegulations.find(r =>
      r.city.toLowerCase() === city?.toLowerCase() && r.state.toUpperCase() === state?.toUpperCase()
    );
    return reg || null;
  }, []);

  const handleGenerateReport = useCallback(async () => {
    if (!selectedLead) { toast.error('Please select a lead'); return; }
    const missing = validateAssumptions();

    const adr = parseFloat(assumptions.estimatedADR) || 0;
    const occupancy = parseFloat(assumptions.estimatedOccupancy) / 100 || 0;
    const leaseCost = parseFloat(assumptions.leaseAcquisitionCost) || 0;
    const mgmtFee = parseFloat(assumptions.managementFeePercent) / 100 || 0.2;
    const cleaningCost = parseFloat(assumptions.cleaningCostPerStay) || 150;
    const platformFee = parseFloat(assumptions.platformFeePercent) / 100 || 0.03;

    const daysPerMonth = 30;
    const staysPerMonth = adr > 0 ? Math.floor((daysPerMonth * occupancy) / 2.5) : 0;
    const grossMonthly = adr * daysPerMonth * occupancy;
    const cleaningTotal = staysPerMonth * cleaningCost;
    const platformTotal = grossMonthly * platformFee;
    const mgmtTotal = grossMonthly * mgmtFee;
    const netMonthly = grossMonthly - cleaningTotal - platformTotal - mgmtTotal;
    const annualNet = netMonthly * 12;
    const monthlyROI = leaseCost > 0 ? ((netMonthly - leaseCost) / leaseCost) * 100 : 0;

    const regulation = getRegulationInfo(selectedLead.city, selectedLead.state);

    setGenerating(true);

    // Generate AI narrative
    const systemPrompt = `You are a professional real estate analyst generating a property report for TRAVLR, a short-term rental management company. 
Generate a concise, professional narrative for a homeowner-facing property report. 
IMPORTANT: Clearly label all financial figures as estimates/projections. Do not fabricate regulatory facts.
Keep the tone professional and suitable for sharing with a homeowner.`;

    const userPrompt = `Generate a property report narrative for:
Property: ${selectedLead.address}, ${selectedLead.city}, ${selectedLead.state}
Type: ${selectedLead.property_type || 'Not specified'}
Beds/Baths: ${selectedLead.beds || 'N/A'} bed / ${selectedLead.baths || 'N/A'} bath

Financial Projections (ALL ARE ESTIMATES):
- Estimated ADR: $${adr}/night
- Estimated Occupancy: ${(occupancy * 100).toFixed(0)}%
- Estimated Gross Monthly Revenue: $${grossMonthly.toFixed(0)}
- Estimated Net Monthly Revenue: $${netMonthly.toFixed(0)}
- Projected Annual Net: $${annualNet.toFixed(0)}
- Monthly Lease/Acquisition Cost: $${leaseCost}
- Monthly ROI vs Cost: ${monthlyROI.toFixed(1)}%

Regulation Info: ${regulation ? `${regulation.summary} Status: ${regulation.status}` : 'No verified regulation data available for this location in our system.'}

Write:
1. A 2-3 sentence Revenue Potential Summary (label as estimates)
2. A Regulation Summary (only use the provided regulation data; if none, say so explicitly)
3. A brief disclaimer paragraph

Keep each section clearly labeled. Total length: ~250 words.`;

    sendMessage([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ], { max_completion_tokens: 600 });

    // Save report to DB
    const reportData = {
      lead_id: selectedLead.id,
      report_status: 'generated',
      property_address: selectedLead.address,
      property_type: selectedLead.property_type || 'Not specified',
      portfolio: selectedLead.portfolio || selectedLead.state || '',
      city: selectedLead.city,
      state: selectedLead.state,
      estimated_adr: adr || null,
      estimated_occupancy_rate: occupancy * 100 || null,
      gross_monthly_revenue: grossMonthly || null,
      net_monthly_revenue: netMonthly || null,
      projected_annual_net: annualNet || null,
      monthly_roi: monthlyROI || null,
      lease_acquisition_cost: leaseCost || null,
      adr_assumption: assumptions.estimatedADR ? `$${assumptions.estimatedADR}/night based on market comparables` : 'Not provided',
      occupancy_assumption: assumptions.estimatedOccupancy ? `${assumptions.estimatedOccupancy}% based on market demand` : 'Not provided',
      cost_assumptions: {
        management_fee_percent: assumptions.managementFeePercent,
        cleaning_cost_per_stay: assumptions.cleaningCostPerStay,
        platform_fee_percent: assumptions.platformFeePercent,
      },
      regulation_summary: regulation ? regulation.summary : 'No verified regulation data available for this location in our system. Please consult local authorities.',
      regulation_source: regulation ? 'system_config' : 'not_available',
      missing_inputs: missing,
      assumptions_provided: missing.length === 0,
      generated_at: new Date().toISOString(),
    };

    const { data: savedReport, error } = await supabase
      .from('property_reports')
      .upsert(reportData, { onConflict: 'lead_id' })
      .select()
      .single();

    if (error) {
      toast.error('Failed to save report');
    } else {
      setReport(savedReport);
      toast.success('Report generated successfully');
    }
    setGenerating(false);
  }, [selectedLead, assumptions, validateAssumptions, getRegulationInfo, sendMessage, supabase]);

  // Update AI narrative when it arrives
  useEffect(() => {
    if (aiResponse && report && !aiLoading) {
      const updateNarrative = async () => {
        const { data } = await supabase
          .from('property_reports')
          .update({ ai_narrative: aiResponse, updated_at: new Date().toISOString() })
          .eq('id', report.id)
          .select()
          .single();
        if (data) setReport(data);
      };
      updateNarrative();
    }
  }, [aiResponse, aiLoading, report, supabase]);

  const handleExportPDF = useCallback(async () => {
    if (!report) return;
    setExportingPDF(true);
    toast.info('Opening print dialog — choose "Save as PDF" to download');
    // Small delay so the toast renders before the print dialog blocks the thread
    await new Promise(resolve => setTimeout(resolve, 300));
    triggerPDFExport(report.property_address);
    setExportingPDF(false);
  }, [report]);

  const handleAttachToEmail = () => {
    toast.success('Report marked for email attachment. Open Email Templates to send.');
  };

  const regulation = selectedLead ? getRegulationInfo(selectedLead.city, selectedLead.state) : null;

  return (
    <AppLayout>
      <div className="p-4 sm:p-6 space-y-6 max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
              <FileText size={20} className="text-primary" />
              Property Report
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">AI-generated per-property report with PDF export</p>
          </div>
          {report && (
            <div className="flex items-center gap-2">
              <button
                onClick={handleAttachToEmail}
                className="flex items-center gap-2 px-3 py-2 text-sm border border-border rounded-lg hover:bg-muted transition-colors"
              >
                <Mail size={14} />
                Attach to Email
              </button>
              <button
                onClick={handleExportPDF}
                disabled={exportingPDF || aiLoading}
                className="flex items-center gap-2 px-3 py-2 text-sm bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-60"
              >
                {exportingPDF ? (
                  <><Loader2 size={14} className="animate-spin" /> Preparing PDF…</>
                ) : (
                  <><Download size={14} /> Export PDF</>
                )}
              </button>
            </div>
          )}
        </div>

        {/* PDF Export Instructions */}
        {report && (
          <div className="flex items-start gap-3 px-4 py-3 bg-blue-50 border border-blue-200 rounded-xl">
            <Printer size={14} className="text-blue-600 shrink-0 mt-0.5" />
            <p className="text-xs text-blue-700 leading-relaxed">
              <strong>To save as PDF:</strong> Click <em>Export PDF</em> → in the print dialog, set <em>Destination</em> to <em>Save as PDF</em> → click Save.
              The report will be formatted for clean single-page printing.
            </p>
          </div>
        )}

        {/* Lead Selector */}
        <div className="bg-card border border-border rounded-xl p-5">
          <label className="block text-sm font-semibold text-foreground mb-2">Select Property / Lead</label>
          <select
            value={selectedLeadId}
            onChange={e => setSelectedLeadId(e.target.value)}
            className="w-full px-3 py-2.5 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-ring/30"
          >
            <option value="">— Choose a lead —</option>
            {leads.map(l => (
              <option key={l.id} value={l.id}>
                {l.address}{l.city ? `, ${l.city}` : ''}{l.state ? `, ${l.state}` : ''}
              </option>
            ))}
          </select>
        </div>

        {selectedLead && (
          <>
            {/* Assumptions Panel */}
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <button
                onClick={() => setShowAssumptions(v => !v)}
                className="w-full flex items-center justify-between px-5 py-4 hover:bg-muted/30 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <BarChart2 size={16} className="text-primary" />
                  <span className="text-sm font-semibold text-foreground">Financial Assumptions</span>
                  {missingInputs.length > 0 && (
                    <span className="text-xs bg-warning/10 text-warning px-2 py-0.5 rounded-full border border-warning/20">
                      {missingInputs.length} missing
                    </span>
                  )}
                </div>
                {showAssumptions ? <ChevronDown size={15} className="text-muted-foreground" /> : <ChevronRight size={15} className="text-muted-foreground" />}
              </button>
              {showAssumptions && (
                <div className="border-t border-border p-5">
                  <p className="text-xs text-muted-foreground mb-4">
                    All financial projections are estimates. Provide your assumptions below to generate accurate projections.
                    Missing inputs will be clearly marked in the report.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {[
                      { key: 'estimatedADR', label: 'Estimated ADR ($/night)', placeholder: 'e.g. 185', required: true },
                      { key: 'estimatedOccupancy', label: 'Estimated Occupancy (%)', placeholder: 'e.g. 72', required: true },
                      { key: 'leaseAcquisitionCost', label: 'Lease/Acquisition Cost ($/mo)', placeholder: 'e.g. 2800', required: true },
                      { key: 'managementFeePercent', label: 'Management Fee (%)', placeholder: '20', required: false },
                      { key: 'cleaningCostPerStay', label: 'Cleaning Cost ($/stay)', placeholder: '150', required: false },
                      { key: 'platformFeePercent', label: 'Platform Fee (%)', placeholder: '3', required: false },
                    ].map(({ key, label, placeholder, required }) => (
                      <div key={key}>
                        <label className="block text-xs font-medium text-muted-foreground mb-1">
                          {label} {required && <span className="text-danger">*</span>}
                        </label>
                        <input
                          type="number"
                          value={assumptions[key as keyof ReportAssumptions]}
                          onChange={e => setAssumptions(prev => ({ ...prev, [key]: e.target.value }))}
                          placeholder={placeholder}
                          className={`w-full px-3 py-2 text-sm border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-ring/30 ${
                            required && !assumptions[key as keyof ReportAssumptions] ? 'border-warning' : 'border-border'
                          }`}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Generate Button */}
            <button
              onClick={handleGenerateReport}
              disabled={generating || aiLoading}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-primary text-white rounded-xl font-medium hover:bg-primary/90 transition-colors disabled:opacity-60"
            >
              {(generating || aiLoading) ? (
                <><Loader2 size={16} className="animate-spin" /> Generating Report…</>
              ) : (
                <><Star size={16} /> {report ? 'Regenerate Report' : 'Generate Report'}</>
              )}
            </button>

            {/* Report Output */}
            {report && (
              <div id="property-report" className="space-y-5 print:space-y-4">
                {/* TRAVLR Header */}
                <div className="bg-primary text-white rounded-xl p-6 print:rounded-none">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-widest opacity-80">TRAVLR Property Report</p>
                      <h2 className="text-xl font-bold mt-1">{report.property_address}</h2>
                      <p className="text-sm opacity-80 mt-0.5">{report.city}, {report.state} · {report.property_type}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs opacity-70">Generated</p>
                      <p className="text-sm font-medium">{report.generated_at ? new Date(report.generated_at).toLocaleDateString() : 'Today'}</p>
                    </div>
                  </div>
                </div>

                {/* Missing Inputs Warning */}
                {report.missing_inputs?.length > 0 && (
                  <div className="bg-warning/10 border border-warning/30 rounded-xl p-4 flex items-start gap-3">
                    <AlertTriangle size={16} className="text-warning shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-semibold text-warning">Some projections require additional inputs</p>
                      <p className="text-xs text-muted-foreground mt-1">Missing: {report.missing_inputs.join(', ')}</p>
                    </div>
                  </div>
                )}

                {/* Revenue Projections */}
                <div className="bg-card border border-border rounded-xl p-5">
                  <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                    <DollarSign size={15} className="text-primary" />
                    Revenue Projections
                    <EstimateTag />
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <MetricCard label="Estimated ADR" value={report.estimated_adr ? `$${report.estimated_adr}/night` : 'Not provided'} sub={report.adr_assumption} isEstimate={!!report.estimated_adr} missing={!report.estimated_adr} />
                    <MetricCard label="Est. Occupancy Rate" value={report.estimated_occupancy_rate ? `${report.estimated_occupancy_rate.toFixed(0)}%` : 'Not provided'} sub={report.occupancy_assumption} isEstimate={!!report.estimated_occupancy_rate} missing={!report.estimated_occupancy_rate} />
                    <MetricCard label="Gross Monthly Revenue" value={report.gross_monthly_revenue ? `$${report.gross_monthly_revenue.toLocaleString('en-US', { maximumFractionDigits: 0 })}` : 'N/A'} isEstimate={!!report.gross_monthly_revenue} missing={!report.gross_monthly_revenue} />
                    <MetricCard label="Net Monthly Revenue" value={report.net_monthly_revenue ? `$${report.net_monthly_revenue.toLocaleString('en-US', { maximumFractionDigits: 0 })}` : 'N/A'} isEstimate={!!report.net_monthly_revenue} missing={!report.net_monthly_revenue} />
                    <MetricCard label="Projected Annual Net" value={report.projected_annual_net ? `$${report.projected_annual_net.toLocaleString('en-US', { maximumFractionDigits: 0 })}` : 'N/A'} isEstimate={!!report.projected_annual_net} missing={!report.projected_annual_net} />
                    <MetricCard label="Monthly ROI vs Cost" value={report.monthly_roi ? `${report.monthly_roi.toFixed(1)}%` : 'N/A'} sub={report.lease_acquisition_cost ? `vs $${report.lease_acquisition_cost.toLocaleString()}/mo cost` : undefined} isEstimate={!!report.monthly_roi} missing={!report.monthly_roi} />
                  </div>

                  {/* Cost Assumptions */}
                  {report.cost_assumptions && Object.keys(report.cost_assumptions).length > 0 && (
                    <div className="mt-4 pt-4 border-t border-border">
                      <p className="text-xs font-semibold text-muted-foreground mb-2">Cost Assumptions Used</p>
                      <div className="flex flex-wrap gap-2">
                        {Object.entries(report.cost_assumptions).map(([k, v]) => (
                          <span key={k} className="text-xs bg-muted px-2 py-1 rounded">
                            {k.replace(/_/g, ' ')}: {String(v)}{k.includes('percent') ? '%' : k.includes('cost') ? '/stay' : ''}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* AI Narrative */}
                {(report.ai_narrative || aiLoading) && (
                  <div className="bg-card border border-border rounded-xl p-5">
                    <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                      <TrendingUp size={15} className="text-primary" />
                      Revenue Potential Summary
                    </h3>
                    {aiLoading ? (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 size={14} className="animate-spin" />
                        Generating AI narrative…
                      </div>
                    ) : (
                      <div className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{report.ai_narrative}</div>
                    )}
                  </div>
                )}

                {/* Regulation Summary */}
                <div className="bg-card border border-border rounded-xl p-5">
                  <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                    <Shield size={15} className="text-primary" />
                    Regulation Summary
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 border border-blue-200 font-medium">
                      {report.regulation_source === 'system_config' ? 'System Config' : 'Not Verified'}
                    </span>
                  </h3>
                  {regulation ? (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${
                          regulation.status === 'Allowed' ? 'bg-success/10 text-success border-success/20' :
                          regulation.status === 'Restricted'? 'bg-warning/10 text-warning border-warning/20' : 'bg-danger/10 text-danger border-danger/20'
                        }`}>{regulation.status}</span>
                        {regulation.permitRequired && <span className="text-xs text-muted-foreground">Permit required</span>}
                        {regulation.primaryResidenceOnly && <span className="text-xs text-warning bg-warning/10 px-2 py-0.5 rounded">Primary residence only</span>}
                      </div>
                      <p className="text-sm text-foreground">{regulation.summary}</p>
                      <div className="space-y-1">
                        {regulation.keyRules.map((rule, i) => (
                          <div key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                            <CheckCircle2 size={11} className="text-success shrink-0 mt-0.5" />
                            {rule}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start gap-2 text-sm text-muted-foreground">
                      <AlertCircle size={14} className="text-warning shrink-0 mt-0.5" />
                      <span>{report.regulation_summary}</span>
                    </div>
                  )}
                </div>

                {/* Disclaimer */}
                <div className="bg-muted/50 border border-border rounded-xl p-4">
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    <strong>Disclaimer:</strong> All financial projections in this report are estimates based on market assumptions and are not guarantees of future performance.
                    Actual results may vary based on property condition, market conditions, seasonality, and other factors.
                    Regulatory information is sourced from TRAVLR&apos;s system configuration and should be independently verified with local authorities before making any decisions.
                    This report is intended for informational purposes only.
                  </p>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </AppLayout>
  );
}
