'use client';

import React, { useState, useRef, useCallback } from 'react';
import { X, Upload, FileText, AlertCircle, CheckCircle, Loader2, Users, ChevronDown } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

interface Agent {
  id: string;
  full_name: string;
}

interface CSVAssignModalProps {
  agents: Agent[];
  onClose: () => void;
  onAssigned: () => void;
}

interface ParsedRow {
  lead_id?: string;
  address?: string;
  agent_id?: string;
  agent_name?: string;
}

function parseCSV(text: string): ParsedRow[] {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/[^a-z_]/g, ''));
  return lines.slice(1).map(line => {
    const vals = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = vals[i] ?? ''; });
    return {
      lead_id: row['lead_id'] || row['id'] || '',
      address: row['address'] || '',
      agent_id: row['agent_id'] || '',
      agent_name: row['agent_name'] || row['agent'] || '',
    };
  }).filter(r => r.lead_id || r.address);
}

export default function CSVAssignModal({ agents, onClose, onAssigned }: CSVAssignModalProps) {
  const { user } = useAuth();
  const supabase = createClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [dragOver, setDragOver] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [error, setError] = useState('');
  const [defaultAgentId, setDefaultAgentId] = useState('');
  const [assigning, setAssigning] = useState(false);
  const [result, setResult] = useState<{ assigned: number; skipped: number; errors: string[] } | null>(null);

  const handleFile = useCallback((f: File) => {
    if (!f.name.endsWith('.csv')) { setError('Please upload a .csv file'); return; }
    setError('');
    setFile(f);
    setResult(null);
    const reader = new FileReader();
    reader.onload = e => {
      const text = e.target?.result as string;
      const parsed = parseCSV(text);
      setRows(parsed);
      if (parsed.length === 0) setError('No valid rows found. Ensure CSV has lead_id or address column.');
    };
    reader.readAsText(f);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }, [handleFile]);

  async function handleAssign() {
    if (rows.length === 0) { setError('No rows to assign'); return; }
    setAssigning(true);
    let assigned = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const row of rows) {
      try {
        // Resolve agent id
        let agentId = row.agent_id || defaultAgentId;
        if (!agentId && row.agent_name) {
          const match = agents.find(a => a.full_name.toLowerCase() === row.agent_name!.toLowerCase());
          if (match) agentId = match.id;
        }
        if (!agentId) { skipped++; continue; }

        // Resolve lead id
        let leadId = row.lead_id;
        if (!leadId && row.address) {
          const { data } = await supabase
            .from('leads')
            .select('id')
            .ilike('address', `%${row.address}%`)
            .limit(1)
            .single();
          leadId = data?.id;
        }
        if (!leadId) { skipped++; continue; }

        // Upsert assignment
        await supabase.from('agent_lead_permissions').delete().eq('surplus_lead_id', leadId);
        await supabase.from('agent_lead_permissions').insert({
          agent_id: agentId,
          surplus_lead_id: leadId,
          can_view: true,
          can_edit: false,
          can_contact: true,
          can_close: false,
          owner_user_id: user?.id,
          assigned_at: new Date().toISOString(),
        });
        assigned++;
      } catch (err: any) {
        errors.push(err?.message ?? 'Unknown error');
      }
    }

    setAssigning(false);
    setResult({ assigned, skipped, errors });
    if (assigned > 0) {
      toast.success(`${assigned} lead${assigned !== 1 ? 's' : ''} assigned via CSV`);
      onAssigned();
    }
  }

  const downloadTemplate = () => {
    const csv = 'lead_id,address,agent_id,agent_name\n,123 Main St Denver CO,,John Smith\n,456 Oak Ave Boulder CO,,Jane Doe';
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'bulk-assign-template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
      <div className="bg-card border border-border rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div>
            <h2 className="text-base font-semibold text-foreground">CSV Bulk Assign</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Upload a CSV to assign leads to agents in bulk</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-all">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {/* Template download */}
          <div className="flex items-center justify-between p-3 bg-muted/40 rounded-lg border border-border/60">
            <div className="flex items-center gap-2">
              <FileText size={14} className="text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Need a template?</span>
            </div>
            <button onClick={downloadTemplate} className="text-xs text-primary hover:underline font-medium">
              Download CSV template
            </button>
          </div>

          {/* Default agent fallback */}
          <div>
            <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
              Default agent (used when CSV row has no agent)
            </label>
            <div className="relative">
              <select
                value={defaultAgentId}
                onChange={e => setDefaultAgentId(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 appearance-none"
              >
                <option value="">— Skip rows without agent —</option>
                {agents.map(a => <option key={a.id} value={a.id}>{a.full_name}</option>)}
              </select>
              <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            </div>
          </div>

          {/* Drop zone */}
          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileRef.current?.click()}
            className={`relative flex flex-col items-center justify-center gap-2 p-8 border-2 border-dashed rounded-xl cursor-pointer transition-all ${dragOver ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50 hover:bg-muted/30'}`}
          >
            <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }} />
            <Upload size={24} className={dragOver ? 'text-primary' : 'text-muted-foreground'} />
            {file ? (
              <div className="text-center">
                <p className="text-sm font-medium text-foreground">{file.name}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{rows.length} rows parsed</p>
              </div>
            ) : (
              <div className="text-center">
                <p className="text-sm font-medium text-foreground">Drop CSV here or click to browse</p>
                <p className="text-xs text-muted-foreground mt-0.5">Columns: lead_id, address, agent_id, agent_name</p>
              </div>
            )}
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-500/5 border border-red-500/20 rounded-lg">
              <AlertCircle size={14} className="text-red-500 shrink-0" />
              <p className="text-xs text-red-600">{error}</p>
            </div>
          )}

          {/* Preview */}
          {rows.length > 0 && !result && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-2">{rows.length} rows ready to assign (preview: first 5)</p>
              <div className="border border-border rounded-lg overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left px-3 py-2 text-muted-foreground font-medium">Lead ID / Address</th>
                      <th className="text-left px-3 py-2 text-muted-foreground font-medium">Agent</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 5).map((r, i) => (
                      <tr key={i} className="border-t border-border/50">
                        <td className="px-3 py-2 text-foreground truncate max-w-[180px]">{r.lead_id || r.address || '—'}</td>
                        <td className="px-3 py-2 text-foreground">{r.agent_name || r.agent_id || <span className="text-muted-foreground italic">default</span>}</td>
                      </tr>
                    ))}
                    {rows.length > 5 && (
                      <tr className="border-t border-border/50">
                        <td colSpan={2} className="px-3 py-2 text-muted-foreground text-center">+{rows.length - 5} more rows</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Result */}
          {result && (
            <div className="p-4 bg-muted/30 border border-border rounded-xl space-y-2">
              <div className="flex items-center gap-2">
                <CheckCircle size={16} className="text-green-500" />
                <span className="text-sm font-semibold text-foreground">Assignment complete</span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="p-2 bg-green-500/10 rounded-lg">
                  <p className="text-lg font-bold text-green-600">{result.assigned}</p>
                  <p className="text-[10px] text-muted-foreground">Assigned</p>
                </div>
                <div className="p-2 bg-amber-500/10 rounded-lg">
                  <p className="text-lg font-bold text-amber-600">{result.skipped}</p>
                  <p className="text-[10px] text-muted-foreground">Skipped</p>
                </div>
                <div className="p-2 bg-red-500/10 rounded-lg">
                  <p className="text-lg font-bold text-red-600">{result.errors.length}</p>
                  <p className="text-[10px] text-muted-foreground">Errors</p>
                </div>
              </div>
              {result.errors.length > 0 && (
                <ul className="space-y-0.5 mt-1">
                  {result.errors.slice(0, 3).map((e, i) => (
                    <li key={i} className="text-[11px] text-red-600">{e}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-muted-foreground border border-border rounded-lg hover:bg-muted transition-all">
            {result ? 'Close' : 'Cancel'}
          </button>
          {!result && (
            <button
              onClick={handleAssign}
              disabled={rows.length === 0 || assigning}
              className="flex items-center gap-2 px-5 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {assigning ? <Loader2 size={14} className="animate-spin" /> : <Users size={14} />}
              {assigning ? `Assigning…` : `Assign ${rows.length} leads`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
