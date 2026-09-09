'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Upload, Users, ChevronDown, ChevronUp, Search, X, Loader2, CheckCircle, AlertTriangle, FileText, RefreshCw, Play, Briefcase, Brain, MessageSquare, BarChart2, Save, ThumbsUp, AlertCircle, ArrowRight, ArrowLeft, Eye, EyeOff, Check, Target, Award, Zap, Shield, ChevronRight, SkipForward, Lock } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Candidate {
  id: string;
  first_name: string;
  last_name: string;
  full_name: string;
  email?: string;
  phone?: string;
  city?: string;
  state?: string;
  resume_file_name?: string;
  resume_parsed_at?: string;
  resume_version?: number;
  professional_summary?: string;
  current_title?: string;
  current_company?: string;
  years_total_experience?: number;
  years_vacation_rental_experience?: number;
  years_sales_experience?: number;
  vacation_rental_experience?: boolean;
  property_management_experience?: boolean;
  luxury_experience?: boolean;
  homeowner_facing_experience?: boolean;
  outbound_calling_experience?: boolean;
  closing_experience?: boolean;
  crm_experience?: boolean;
  leadership_experience?: boolean;
  operations_experience?: boolean;
  strengths?: string[];
  concerns?: string[];
  resume_highlights?: string[];
  candidate_rank?: number;
  interview_priority?: string;
  candidate_status?: string;
  seed_fit_notes?: string;
  seed_concerns?: string;
  interview_script?: InterviewScript | null;
  script_generated_at?: string;
  work_experience?: WorkExperience[];
  skills?: string[];
  relevant_systems?: string[];
  experience_classifications?: ExperienceClassification[];
  created_at?: string;
}

interface WorkExperience {
  company: string;
  title: string;
  location?: string;
  startDate?: string;
  endDate?: string;
  currentRole?: boolean;
  duration?: string;
  responsibilities?: string[];
  achievements?: string[];
  relevantSkills?: string[];
}

interface ExperienceClassification {
  category: string;
  strength: 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE' | 'UNKNOWN';
  evidence?: Array<{ employer: string; role: string; resumeEvidence: string }>;
}

interface InterviewScript {
  candidateSnapshot?: {
    name: string;
    rank?: number;
    priority?: string;
    currentRole?: string;
    location?: string;
    yearsRelevantExperience?: string;
    vacationRentalExperience?: boolean;
    propertyManagement?: boolean;
    outboundSales?: boolean;
    phoneSales?: boolean;
    closing?: boolean;
    crm?: boolean;
    leadership?: boolean;
    top3Strengths?: string[];
    top3ToValidate?: string[];
  };
  interviewStrategy?: string;
  sections?: InterviewSection[];
  rolePlays?: RolePlay[];
  scorecard?: { competencies: Array<{ name: string; description: string }> };
  postInterviewPrompts?: string[];
}

interface InterviewSection {
  id: string;
  sectionLabel: string;
  sectionType: 'CONTEXT' | 'SCRIPT';
  questions?: InterviewQuestion[];
}

interface InterviewQuestion {
  id: string;
  questionText: string;
  resumeBasis?: string;
  isCore?: boolean;
  isLocked?: boolean;
  followUps?: string[];
  listenFor?: string[];
  interviewerNote?: string;
}

interface RolePlay {
  id: string;
  scenario: string;
  homeownerLine: string;
  watchFor?: string[];
}

interface UploadResult {
  fileName: string;
  candidateId?: string;
  fullName?: string;
  status: 'created' | 'updated' | 'possible_duplicate' | 'error';
  message?: string;
}

interface InterviewNote {
  id?: string;
  question_id?: string;
  question_text?: string;
  note_text: string;
}

interface Scorecard {
  vacation_rental_knowledge?: number;
  property_management_knowledge?: number;
  luxury_homeowner_communication?: number;
  outbound_calling_ability?: number;
  consultative_sales?: number;
  discovery_questioning?: number;
  objection_handling?: number;
  closing_ability?: number;
  follow_up_discipline?: number;
  crm_pipeline_management?: number;
  relationship_building?: number;
  professional_communication?: number;
  self_motivation?: number;
  remote_work_discipline?: number;
  coachability?: number;
  operational_understanding?: number;
  business_development?: number;
  judgment?: number;
  organization?: number;
  overall_fit?: number;
  hire_recommendation?: string;
  interviewer_notes?: string;
  ai_summary?: Record<string, unknown>;
}

// ─── Priority badge ───────────────────────────────────────────────────────────

function PriorityBadge({ priority }: { priority?: string }) {
  const map: Record<string, { label: string; color: string }> = {
    HIGHEST: { label: 'Highest Priority', color: 'bg-red-100 text-red-700 border-red-200' },
    VERY_HIGH: { label: 'Very High', color: 'bg-orange-100 text-orange-700 border-orange-200' },
    HIGH: { label: 'High', color: 'bg-amber-100 text-amber-700 border-amber-200' },
    VERY_STRONG: { label: 'Very Strong', color: 'bg-blue-100 text-blue-700 border-blue-200' },
    STRONG_SECONDARY: { label: 'Strong Secondary', color: 'bg-indigo-100 text-indigo-700 border-indigo-200' },
    SOLID_MID_TIER: { label: 'Solid Mid-Tier', color: 'bg-gray-100 text-gray-700 border-gray-200' },
    STANDARD: { label: 'Standard', color: 'bg-gray-100 text-gray-600 border-gray-200' },
  };
  const info = map[priority || 'STANDARD'] || map.STANDARD;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${info.color}`}>
      {info.label}
    </span>
  );
}

function StatusBadge({ status }: { status?: string }) {
  const map: Record<string, { label: string; color: string }> = {
    RESUME_UPLOADED: { label: 'Resume Uploaded', color: 'bg-blue-50 text-blue-700' },
    PROCESSING: { label: 'Processing...', color: 'bg-yellow-50 text-yellow-700' },
    READY_TO_INTERVIEW: { label: 'Resume Ready', color: 'bg-green-50 text-green-700' },
    INTERVIEW_SCHEDULED: { label: 'Scheduled', color: 'bg-purple-50 text-purple-700' },
    INTERVIEWED: { label: 'Interviewed', color: 'bg-gray-100 text-gray-700' },
    FOLLOW_UP: { label: 'Follow-Up', color: 'bg-amber-50 text-amber-700' },
    SECOND_INTERVIEW: { label: '2nd Interview', color: 'bg-indigo-50 text-indigo-700' },
    HOLD: { label: 'On Hold', color: 'bg-gray-100 text-gray-500' },
    NOT_MOVING_FORWARD: { label: 'Not Moving Forward', color: 'bg-red-50 text-red-600' },
    HIRED: { label: 'Hired', color: 'bg-emerald-100 text-emerald-700' },
  };
  const info = map[status || 'RESUME_UPLOADED'] || map.RESUME_UPLOADED;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${info.color}`}>
      {info.label}
    </span>
  );
}

// ─── Resume Upload Panel ──────────────────────────────────────────────────────

function ResumeUploadPanel({
  onUploadComplete,
}: {
  onUploadComplete: () => void;
}) {
  const [dragging, setDragging] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [results, setResults] = useState<UploadResult[]>([]);
  const [processingStatus, setProcessingStatus] = useState<Record<string, string>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = (newFiles: FileList | null) => {
    if (!newFiles) return;
    const valid = Array.from(newFiles).filter(f =>
      f.type === 'application/pdf' ||
      f.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || f.name.endsWith('.pdf') || f.name.endsWith('.docx') || f.name.endsWith('.doc')
    );
    if (valid.length < newFiles.length) {
      toast.error('Only PDF and DOCX files are supported');
    }
    setFiles(prev => [...prev, ...valid]);
  };

  const removeFile = (idx: number) => {
    setFiles(prev => prev.filter((_, i) => i !== idx));
  };

  const handleUpload = async () => {
    if (files.length === 0) return;
    setUploading(true);
    setResults([]);

    const initialStatus: Record<string, string> = {};
    files.forEach(f => { initialStatus[f.name] = 'Uploading...'; });
    setProcessingStatus(initialStatus);

    try {
      const formData = new FormData();
      files.forEach(f => formData.append('resumes', f));

      setProcessingStatus(prev => {
        const next = { ...prev };
        files.forEach(f => { next[f.name] = 'Parsing...'; });
        return next;
      });

      const res = await fetch('/api/candidates/upload-resume', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      const uploadResults: UploadResult[] = data.results || [];
      setResults(uploadResults);

      const finalStatus: Record<string, string> = {};
      uploadResults.forEach(r => {
        finalStatus[r.fileName] = r.status === 'error' ? `Error: ${r.message}` : 'Uploaded';
      });
      setProcessingStatus(finalStatus);

      const toAnalyze = uploadResults.filter(r => r.candidateId && r.status !== 'error');

      for (const result of toAnalyze) {
        if (!result.candidateId) continue;
        setProcessingStatus(prev => ({ ...prev, [result.fileName]: 'Analyzing...' }));

        try {
          await fetch('/api/candidates/analyze-resume', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ candidateId: result.candidateId }),
          });

          setProcessingStatus(prev => ({ ...prev, [result.fileName]: 'Generating script...' }));

          await fetch('/api/candidates/generate-script', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ candidateId: result.candidateId }),
          });

          setProcessingStatus(prev => ({ ...prev, [result.fileName]: 'Ready ✓' }));
        } catch {
          setProcessingStatus(prev => ({ ...prev, [result.fileName]: 'Script pending' }));
        }
      }

      const successCount = uploadResults.filter(r => r.status !== 'error').length;
      if (successCount > 0) {
        toast.success(`${successCount} resume${successCount > 1 ? 's' : ''} processed successfully`);
        onUploadComplete();
      }

      setFiles([]);
    } catch (err) {
      console.error('[upload]', err);
      toast.error('Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-8 h-8 rounded-xl bg-gray-900 dark:bg-white flex items-center justify-center">
          <Upload className="w-4 h-4 text-white dark:text-gray-900" />
        </div>
        <div>
          <h3 className="text-sm font-bold text-gray-900 dark:text-white">Candidate Resumes</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400">Upload PDF or DOCX — multiple at once</p>
        </div>
      </div>

      <div
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files); }}
        onClick={() => fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
          dragging ? 'border-gray-900 bg-gray-50 dark:border-white dark:bg-gray-800' : 'border-gray-200 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-500'
        }`}
      >
        <Upload className="w-6 h-6 text-gray-400 mx-auto mb-2" />
        <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Drop resumes here or click to browse</p>
        <p className="text-xs text-gray-400 mt-1">PDF, DOCX · Multiple files supported</p>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.docx,.doc"
          className="hidden"
          onChange={e => handleFiles(e.target.files)}
        />
      </div>

      {files.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {files.map((f, i) => (
            <div key={i} className="flex items-center gap-2 px-3 py-2 bg-gray-50 dark:bg-gray-800 rounded-xl">
              <FileText className="w-4 h-4 text-gray-400 flex-shrink-0" />
              <span className="flex-1 text-xs text-gray-700 dark:text-gray-300 truncate">{f.name}</span>
              <span className="text-xs text-gray-400">{(f.size / 1024).toFixed(0)}KB</span>
              {!uploading && (
                <button onClick={() => removeFile(i)} className="p-1 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
                  <X className="w-3 h-3 text-gray-400" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {uploading && Object.keys(processingStatus).length > 0 && (
        <div className="mt-3 space-y-1.5">
          {Object.entries(processingStatus).map(([fileName, status]) => (
            <div key={fileName} className="flex items-center gap-2 px-3 py-2 bg-blue-50 dark:bg-blue-900/20 rounded-xl">
              {status.includes('Ready') ? (
                <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
              ) : status.includes('Error') ? (
                <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
              ) : (
                <Loader2 className="w-4 h-4 text-blue-500 animate-spin flex-shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-gray-700 dark:text-gray-300 truncate">{fileName}</p>
                <p className="text-[10px] text-gray-500 dark:text-gray-400">{status}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {results.length > 0 && !uploading && (
        <div className="mt-3 space-y-1.5">
          {results.map((r, i) => (
            <div key={i} className={`flex items-start gap-2 px-3 py-2 rounded-xl ${
              r.status === 'error' ? 'bg-red-50 dark:bg-red-900/20' : 'bg-green-50 dark:bg-green-900/20'
            }`}>
              {r.status === 'error' ? (
                <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
              ) : (
                <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-gray-700 dark:text-gray-300">{r.fullName || r.fileName}</p>
                <p className="text-[10px] text-gray-500 dark:text-gray-400">{r.message}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {files.length > 0 && !uploading && (
        <button
          onClick={handleUpload}
          className="mt-3 w-full py-2.5 px-4 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-xl text-sm font-semibold hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors flex items-center justify-center gap-2"
        >
          <Upload className="w-4 h-4" />
          Upload {files.length} Resume{files.length > 1 ? 's' : ''}
        </button>
      )}
    </div>
  );
}

// ─── Candidate Dropdown ───────────────────────────────────────────────────────

function CandidateDropdown({
  candidates,
  selectedId,
  onSelect,
  loading,
}: {
  candidates: Candidate[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  loading: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  const selected = candidates.find(c => c.id === selectedId);

  const filtered = candidates.filter(c =>
    c.full_name.toLowerCase().includes(search.toLowerCase())
  );

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-4 py-3 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl hover:border-gray-400 dark:hover:border-gray-500 transition-colors"
      >
        <div className="w-8 h-8 rounded-full bg-gray-900 dark:bg-white flex items-center justify-center flex-shrink-0">
          <span className="text-xs font-bold text-white dark:text-gray-900">
            {selected ? selected.full_name.charAt(0) : '?'}
          </span>
        </div>
        <div className="flex-1 text-left min-w-0">
          {loading ? (
            <div className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
              <span className="text-sm text-gray-400">Loading candidates...</span>
            </div>
          ) : selected ? (
            <>
              <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{selected.full_name}</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <PriorityBadge priority={selected.interview_priority} />
                <StatusBadge status={selected.candidate_status} />
              </div>
            </>
          ) : (
            <p className="text-sm text-gray-400">Select Candidate</p>
          )}
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-gray-400 flex-shrink-0" /> : <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />}
      </button>

      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl z-50 overflow-hidden">
          <div className="p-2 border-b border-gray-100 dark:border-gray-800">
            <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <Search className="w-3.5 h-3.5 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search candidates..."
                className="flex-1 text-xs bg-transparent text-gray-700 dark:text-gray-300 placeholder-gray-400 outline-none"
                autoFocus
              />
            </div>
          </div>
          <div className="max-h-64 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-4 py-6 text-center text-xs text-gray-400">No candidates found</div>
            ) : (
              filtered.map(c => (
                <button
                  key={c.id}
                  onClick={() => { onSelect(c.id); setOpen(false); setSearch(''); }}
                  className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-left ${
                    c.id === selectedId ? 'bg-gray-50 dark:bg-gray-800' : ''
                  }`}
                >
                  <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center flex-shrink-0">
                    <span className="text-xs font-bold text-gray-600 dark:text-gray-300">{c.full_name.charAt(0)}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      {c.candidate_rank && (
                        <span className="text-[10px] font-bold text-gray-400">#{c.candidate_rank}</span>
                      )}
                      <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{c.full_name}</p>
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                      <PriorityBadge priority={c.interview_priority} />
                      <StatusBadge status={c.candidate_status} />
                    </div>
                  </div>
                  {c.id === selectedId && <Check className="w-4 h-4 text-gray-900 dark:text-white flex-shrink-0" />}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Candidate Intelligence Panel (private — never read aloud) ────────────────

function CandidateIntelligencePanel({ candidate }: { candidate: Candidate }) {
  const snapshot = candidate.interview_script?.candidateSnapshot;
  const strengths = snapshot?.top3Strengths || (Array.isArray(candidate.strengths) ? candidate.strengths.slice(0, 3) : []);
  const toValidate = snapshot?.top3ToValidate || (Array.isArray(candidate.concerns) ? candidate.concerns.slice(0, 3) : []);

  const expFlags = [
    { label: 'Vacation Rental', value: candidate.vacation_rental_experience },
    { label: 'Property Mgmt', value: candidate.property_management_experience },
    { label: 'Luxury', value: candidate.luxury_experience },
    { label: 'Homeowner-Facing', value: candidate.homeowner_facing_experience },
    { label: 'Outbound Calling', value: candidate.outbound_calling_experience },
    { label: 'Closing', value: candidate.closing_experience },
    { label: 'CRM', value: candidate.crm_experience },
    { label: 'Leadership', value: candidate.leadership_experience },
  ];

  return (
    <div className="rounded-2xl border-2 border-amber-300 dark:border-amber-700 overflow-hidden">
      {/* Private header banner */}
      <div className="bg-amber-500 dark:bg-amber-700 px-4 py-2 flex items-center gap-2">
        <EyeOff className="w-4 h-4 text-white flex-shrink-0" />
        <span className="text-xs font-bold text-white uppercase tracking-wider">Candidate Intelligence</span>
        <span className="ml-auto text-[10px] font-semibold text-amber-100 bg-amber-600 dark:bg-amber-800 px-2 py-0.5 rounded-full">
          Private · Never read aloud
        </span>
      </div>

      <div className="bg-amber-50 dark:bg-amber-900/10 p-4 space-y-3">
        {/* Identity */}
        <div>
          <p className="text-base font-bold text-gray-900 dark:text-white">{candidate.full_name}</p>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {candidate.candidate_rank && (
              <span className="text-xs text-gray-500 dark:text-gray-400">Rank #{candidate.candidate_rank}</span>
            )}
            <PriorityBadge priority={candidate.interview_priority} />
            <StatusBadge status={candidate.candidate_status} />
          </div>
          {(candidate.current_title || candidate.current_company) && (
            <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
              {candidate.current_title}{candidate.current_company ? ` · ${candidate.current_company}` : ''}
            </p>
          )}
          {(candidate.city || candidate.state) && (
            <p className="text-xs text-gray-500 dark:text-gray-500 mt-0.5">
              {[candidate.city, candidate.state].filter(Boolean).join(', ')}
            </p>
          )}
        </div>

        {/* Experience flags */}
        <div>
          <p className="text-[10px] font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wide mb-1.5">Experience Profile</p>
          <div className="flex flex-wrap gap-1.5">
            {expFlags.map(f => (
              <span key={f.label} className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                f.value ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-600'
              }`}>
                {f.value ? '✓' : '–'} {f.label}
              </span>
            ))}
          </div>
        </div>

        {/* Years */}
        {(candidate.years_total_experience || candidate.years_vacation_rental_experience || candidate.years_sales_experience) && (
          <div className="grid grid-cols-3 gap-2">
            {candidate.years_total_experience && (
              <div className="bg-white dark:bg-gray-800 rounded-xl p-2 text-center border border-amber-100 dark:border-amber-900/30">
                <p className="text-base font-bold text-gray-900 dark:text-white">{candidate.years_total_experience}</p>
                <p className="text-[10px] text-gray-500 dark:text-gray-400">Total Yrs</p>
              </div>
            )}
            {candidate.years_vacation_rental_experience && (
              <div className="bg-white dark:bg-gray-800 rounded-xl p-2 text-center border border-amber-100 dark:border-amber-900/30">
                <p className="text-base font-bold text-gray-900 dark:text-white">{candidate.years_vacation_rental_experience}</p>
                <p className="text-[10px] text-gray-500 dark:text-gray-400">VR Yrs</p>
              </div>
            )}
            {candidate.years_sales_experience && (
              <div className="bg-white dark:bg-gray-800 rounded-xl p-2 text-center border border-amber-100 dark:border-amber-900/30">
                <p className="text-base font-bold text-gray-900 dark:text-white">{candidate.years_sales_experience}</p>
                <p className="text-[10px] text-gray-500 dark:text-gray-400">Sales Yrs</p>
              </div>
            )}
          </div>
        )}

        {/* Strengths */}
        {strengths.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold text-green-700 dark:text-green-400 uppercase tracking-wide mb-1">Top Strengths</p>
            <ul className="space-y-1">
              {strengths.map((s, i) => (
                <li key={i} className="flex items-start gap-1.5 text-xs text-gray-700 dark:text-gray-300">
                  <ThumbsUp className="w-3 h-3 text-green-500 flex-shrink-0 mt-0.5" />
                  <span>{s}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* To validate */}
        {toValidate.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wide mb-1">Validate During Interview</p>
            <ul className="space-y-1">
              {toValidate.map((c, i) => (
                <li key={i} className="flex items-start gap-1.5 text-xs text-gray-700 dark:text-gray-300">
                  <AlertCircle className="w-3 h-3 text-amber-500 flex-shrink-0 mt-0.5" />
                  <span>{c}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Seed context if no AI analysis */}
        {!candidate.interview_script && candidate.seed_fit_notes && (
          <div className="bg-white dark:bg-gray-800 rounded-xl p-3 border border-amber-100 dark:border-amber-900/30">
            <p className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Seed Fit Notes</p>
            <p className="text-xs text-gray-700 dark:text-gray-300">{candidate.seed_fit_notes}</p>
            {candidate.seed_concerns && (
              <>
                <p className="text-[10px] font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wide mt-2 mb-1">Concerns</p>
                <p className="text-xs text-gray-700 dark:text-gray-300">{candidate.seed_concerns}</p>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Context Section Block (private interviewer intelligence) ─────────────────

function ContextSectionBlock({ section }: { section: InterviewSection }) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="rounded-2xl border-2 border-amber-300 dark:border-amber-700 overflow-hidden mb-4">
      {/* Private banner */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full bg-amber-500 dark:bg-amber-700 px-4 py-2.5 flex items-center gap-2 hover:bg-amber-600 dark:hover:bg-amber-600 transition-colors"
      >
        <EyeOff className="w-4 h-4 text-white flex-shrink-0" />
        <span className="text-xs font-bold text-white uppercase tracking-wider flex-1 text-left">{section.sectionLabel}</span>
        <span className="text-[10px] font-semibold text-amber-100 bg-amber-600 dark:bg-amber-800 px-2 py-0.5 rounded-full mr-2">
          Private · Never read aloud
        </span>
        {expanded ? <ChevronUp className="w-4 h-4 text-white" /> : <ChevronDown className="w-4 h-4 text-white" />}
      </button>

      {expanded && (
        <div className="bg-amber-50 dark:bg-amber-900/10 p-4 space-y-3">
          {(section.questions || []).map((q, i) => (
            <div key={q.id || i} className="bg-white dark:bg-gray-800 rounded-xl p-3 border border-amber-100 dark:border-amber-900/30">
              <p className="text-sm font-medium text-amber-900 dark:text-amber-200 leading-relaxed">{q.questionText}</p>
              {q.resumeBasis && q.resumeBasis !== 'Standard TRAVLR question' && (
                <p className="text-[10px] text-amber-600 dark:text-amber-500 mt-1.5 italic">Source: {q.resumeBasis}</p>
              )}
              {q.interviewerNote && (
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-2 border-t border-amber-100 dark:border-amber-900/30 pt-2">{q.interviewerNote}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Interview Teleprompter ───────────────────────────────────────────────────

function InterviewTeleprompter({
  candidate,
  onClose,
}: {
  candidate: Candidate;
  onClose: () => void;
}) {
  const script = candidate.interview_script;
  const allSections = script?.sections || [];

  // Separate CONTEXT sections from SCRIPT sections
  const contextSections = allSections.filter(s => s.sectionType === 'CONTEXT');
  const scriptSections = allSections.filter(s => s.sectionType === 'SCRIPT');

  const allScriptQuestions = scriptSections.flatMap(s => s.questions || []);

  const [currentSectionIdx, setCurrentSectionIdx] = useState(0);
  const [currentQuestionIdx, setCurrentQuestionIdx] = useState(0);
  const [completedQuestions, setCompletedQuestions] = useState<Set<string>>(new Set());
  const [expandedFollowUps, setExpandedFollowUps] = useState<Set<string>>(new Set());
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [savingNote, setSavingNote] = useState<string | null>(null);
  const [scorecard, setScorecard] = useState<Scorecard>({});
  const [showScorecard, setShowScorecard] = useState(false);
  const [showAISummary, setShowAISummary] = useState(false);
  const [generatingSummary, setGeneratingSummary] = useState(false);
  const [askDeeperLoading, setAskDeeperLoading] = useState(false);
  const [askDeeperResult, setAskDeeperResult] = useState<string | null>(null);
  const [interviewStarted, setInterviewStarted] = useState(false);
  const [showContextPanel, setShowContextPanel] = useState(false);

  const currentSection = scriptSections[currentSectionIdx];
  const currentSectionQuestions = currentSection?.questions || [];
  const currentQuestion = currentSectionQuestions[currentQuestionIdx];
  const totalQuestions = allScriptQuestions.length;
  const completedCount = completedQuestions.size;

  const saveNote = useCallback(async (questionId: string, questionText: string, noteText: string) => {
    if (!noteText.trim()) return;
    setSavingNote(questionId);
    try {
      await fetch('/api/candidates/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          candidateId: candidate.id,
          questionId,
          questionText,
          noteText,
        }),
      });
    } catch (err) {
      console.error('[save note]', err);
    } finally {
      setSavingNote(null);
    }
  }, [candidate.id]);

  const handleAskDeeper = async () => {
    if (!currentQuestion) return;
    setAskDeeperLoading(true);
    setAskDeeperResult(null);
    try {
      const res = await fetch('/api/candidates/ask-deeper', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          candidateId: candidate.id,
          currentQuestion: currentQuestion.questionText,
          interviewerNote: notes[currentQuestion.id],
        }),
      });
      const data = await res.json();
      setAskDeeperResult(data.followUp || null);
    } catch {
      toast.error('Could not generate follow-up');
    } finally {
      setAskDeeperLoading(false);
    }
  };

  const handleSaveScorecard = async (generateSummary = false) => {
    setGeneratingSummary(generateSummary);
    try {
      const res = await fetch('/api/candidates/scorecard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          candidateId: candidate.id,
          ...scorecard,
          generateSummary,
        }),
      });
      const data = await res.json();
      if (data.scorecard?.ai_summary) {
        setScorecard(prev => ({ ...prev, ai_summary: data.scorecard.ai_summary }));
        setShowAISummary(true);
      }
      toast.success(generateSummary ? 'Scorecard saved & AI summary generated' : 'Scorecard saved');
    } catch {
      toast.error('Failed to save scorecard');
    } finally {
      setGeneratingSummary(false);
    }
  };

  const nextQuestion = () => {
    if (currentQuestion) {
      setCompletedQuestions(prev => new Set([...prev, currentQuestion.id]));
    }
    if (currentQuestionIdx < currentSectionQuestions.length - 1) {
      setCurrentQuestionIdx(i => i + 1);
    } else if (currentSectionIdx < scriptSections.length - 1) {
      setCurrentSectionIdx(i => i + 1);
      setCurrentQuestionIdx(0);
    }
    setAskDeeperResult(null);
  };

  const prevQuestion = () => {
    if (currentQuestionIdx > 0) {
      setCurrentQuestionIdx(i => i - 1);
    } else if (currentSectionIdx > 0) {
      setCurrentSectionIdx(i => i - 1);
      const prevSection = scriptSections[currentSectionIdx - 1];
      setCurrentQuestionIdx((prevSection?.questions?.length || 1) - 1);
    }
    setAskDeeperResult(null);
  };

  const SCORECARD_FIELDS: Array<{ key: keyof Scorecard; label: string }> = [
    { key: 'vacation_rental_knowledge', label: 'Vacation Rental Knowledge' },
    { key: 'property_management_knowledge', label: 'Property Management' },
    { key: 'luxury_homeowner_communication', label: 'Luxury Homeowner Communication' },
    { key: 'outbound_calling_ability', label: 'Outbound Calling' },
    { key: 'consultative_sales', label: 'Consultative Sales' },
    { key: 'discovery_questioning', label: 'Discovery / Questioning' },
    { key: 'objection_handling', label: 'Objection Handling' },
    { key: 'closing_ability', label: 'Closing Ability' },
    { key: 'follow_up_discipline', label: 'Follow-Up Discipline' },
    { key: 'crm_pipeline_management', label: 'CRM / Pipeline Management' },
    { key: 'relationship_building', label: 'Relationship Building' },
    { key: 'professional_communication', label: 'Professional Communication' },
    { key: 'self_motivation', label: 'Self-Motivation' },
    { key: 'remote_work_discipline', label: 'Remote Work Discipline' },
    { key: 'coachability', label: 'Coachability' },
    { key: 'operational_understanding', label: 'Operational Understanding' },
    { key: 'business_development', label: 'Business Development' },
    { key: 'judgment', label: 'Judgment' },
    { key: 'organization', label: 'Organization' },
    { key: 'overall_fit', label: 'Overall Fit' },
  ];

  if (!interviewStarted) {
    return (
      <div className="flex flex-col h-full overflow-y-auto">
        {/* Pre-interview: show context sections first */}
        {contextSections.length > 0 && (
          <div className="p-4 border-b border-gray-100 dark:border-gray-800">
            <div className="flex items-center gap-2 mb-3">
              <EyeOff className="w-4 h-4 text-amber-500" />
              <h3 className="text-sm font-bold text-gray-900 dark:text-white">Candidate Intelligence</h3>
              <span className="text-[10px] text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 px-2 py-0.5 rounded-full font-semibold">
                Private — Never read aloud to candidate
              </span>
            </div>
            <div className="space-y-3">
              {contextSections.map(section => (
                <ContextSectionBlock key={section.id} section={section} />
              ))}
            </div>
          </div>
        )}

        {/* Start interview CTA */}
        <div className="flex flex-col items-center justify-center flex-1 p-8 text-center">
          <div className="w-16 h-16 rounded-2xl bg-gray-900 dark:bg-white flex items-center justify-center mb-4">
            <Play className="w-8 h-8 text-white dark:text-gray-900" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
            Interview: {candidate.full_name}
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
            {totalQuestions} teleprompter questions across {scriptSections.length} sections
          </p>
          {script?.interviewStrategy && (
            <div className="max-w-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4 mb-6 text-left">
              <p className="text-xs font-semibold text-blue-700 dark:text-blue-400 uppercase tracking-wide mb-1">Interview Strategy</p>
              <p className="text-sm text-blue-800 dark:text-blue-300">{script.interviewStrategy}</p>
            </div>
          )}
          <button
            onClick={() => setInterviewStarted(true)}
            className="px-8 py-3 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-xl font-semibold text-sm hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors flex items-center gap-2"
          >
            <Play className="w-4 h-4" />
            Start Interview
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Progress bar */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
        <div className="flex-1 h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-gray-900 dark:bg-white rounded-full transition-all duration-500"
            style={{ width: `${totalQuestions > 0 ? (completedCount / totalQuestions) * 100 : 0}%` }}
          />
        </div>
        <span className="text-xs text-gray-400 flex-shrink-0">{completedCount}/{totalQuestions}</span>

        {/* Toggle context panel */}
        {contextSections.length > 0 && (
          <button
            onClick={() => setShowContextPanel(s => !s)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
              showContextPanel
                ? 'bg-amber-500 text-white' :'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-700 hover:bg-amber-100 dark:hover:bg-amber-900/30'
            }`}
          >
            <EyeOff className="w-3.5 h-3.5" />
            Intelligence
          </button>
        )}

        <button
          onClick={() => setShowScorecard(s => !s)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
            showScorecard ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
          }`}
        >
          <BarChart2 className="w-3.5 h-3.5" />
          Scorecard
        </button>
      </div>

      {/* Context panel overlay (shown during interview) */}
      {showContextPanel && (
        <div className="border-b border-amber-200 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/10 p-4 max-h-64 overflow-y-auto flex-shrink-0">
          <div className="flex items-center gap-2 mb-3">
            <EyeOff className="w-4 h-4 text-amber-600" />
            <span className="text-xs font-bold text-amber-800 dark:text-amber-300 uppercase tracking-wide">Candidate Intelligence</span>
            <span className="text-[10px] text-amber-600 dark:text-amber-500 ml-auto">Private — never read aloud</span>
          </div>
          <div className="space-y-2">
            {contextSections.map(section => (
              <div key={section.id} className="bg-white dark:bg-gray-800 rounded-xl p-3 border border-amber-100 dark:border-amber-900/30">
                <p className="text-[10px] font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wide mb-2">{section.sectionLabel}</p>
                {(section.questions || []).map((q, i) => (
                  <p key={i} className="text-xs text-amber-900 dark:text-amber-200 mb-1.5 last:mb-0">{q.questionText}</p>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {showScorecard ? (
        /* ── Scorecard ── */
        <div className="flex-1 overflow-y-auto p-4">
          <div className="max-w-2xl mx-auto">
            <div className="flex items-center gap-2 mb-4">
              <Award className="w-5 h-5 text-gray-700 dark:text-gray-300" />
              <h3 className="text-base font-bold text-gray-900 dark:text-white">TRAVLR Candidate Scorecard</h3>
              <span className="text-xs text-gray-400 ml-auto">{candidate.full_name}</span>
            </div>

            <div className="grid grid-cols-1 gap-3 mb-4">
              {SCORECARD_FIELDS.map(field => (
                <div key={field.key} className="flex items-center gap-3">
                  <span className="text-xs text-gray-700 dark:text-gray-300 w-48 flex-shrink-0">{field.label}</span>
                  <div className="flex items-center gap-1">
                    {[1,2,3,4,5,6,7,8,9,10].map(n => (
                      <button
                        key={n}
                        onClick={() => setScorecard(prev => ({ ...prev, [field.key]: n }))}
                        className={`w-7 h-7 rounded-lg text-xs font-semibold transition-colors ${
                          (scorecard[field.key] as number) === n
                            ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900' : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                        }`}
                      >
                        {n}
                      </button>
                    ))}
                    <span className="text-xs text-gray-400 ml-1 w-8">
                      {scorecard[field.key] ? `${scorecard[field.key]}/10` : '__/10'}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <div className="mb-4">
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5 uppercase tracking-wide">Hire Recommendation</label>
              <div className="flex gap-2 flex-wrap">
                {['STRONG_YES', 'YES', 'MAYBE', 'NO', 'PENDING'].map(rec => (
                  <button
                    key={rec}
                    onClick={() => setScorecard(prev => ({ ...prev, hire_recommendation: rec }))}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
                      scorecard.hire_recommendation === rec
                        ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                    }`}
                  >
                    {rec.replace('_', ' ')}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-gray-400 mt-1">Final hire/reject decision is human-only. AI may not auto-hire or auto-reject.</p>
            </div>

            <div className="mb-4">
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5 uppercase tracking-wide">Interviewer Notes</label>
              <textarea
                value={scorecard.interviewer_notes || ''}
                onChange={e => setScorecard(prev => ({ ...prev, interviewer_notes: e.target.value }))}
                rows={3}
                className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 text-sm text-gray-900 dark:text-white bg-white dark:bg-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900 dark:focus:ring-white resize-none"
                placeholder="Overall impressions, key observations..."
              />
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => handleSaveScorecard(false)}
                className="flex-1 py-2.5 px-4 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-xl text-sm font-semibold hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors flex items-center justify-center gap-2"
              >
                <Save className="w-4 h-4" />
                Save Scorecard
              </button>
              <button
                onClick={() => handleSaveScorecard(true)}
                disabled={generatingSummary}
                className="flex-1 py-2.5 px-4 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-xl text-sm font-semibold hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {generatingSummary ? <Loader2 className="w-4 h-4 animate-spin" /> : <Brain className="w-4 h-4" />}
                Save & Generate AI Summary
              </button>
            </div>

            {scorecard.ai_summary && showAISummary && (
              <div className="mt-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-2xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Brain className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  <h4 className="text-sm font-bold text-blue-800 dark:text-blue-300">Post-Interview AI Summary</h4>
                  <p className="text-[10px] text-blue-500 dark:text-blue-500 ml-auto">AI-generated · Human decision required</p>
                </div>
                {Object.entries(scorecard.ai_summary as Record<string, unknown>).map(([key, value]) => {
                  if (!value || (Array.isArray(value) && value.length === 0)) return null;
                  const label = key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase());
                  return (
                    <div key={key} className="mb-3">
                      <p className="text-[10px] font-semibold text-blue-700 dark:text-blue-400 uppercase tracking-wide mb-1">{label}</p>
                      {Array.isArray(value) ? (
                        <ul className="space-y-0.5">
                          {(value as string[]).map((item, i) => (
                            <li key={i} className="text-xs text-blue-800 dark:text-blue-300 flex items-start gap-1.5">
                              <span className="text-blue-400 flex-shrink-0">•</span>
                              <span>{item}</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-xs text-blue-800 dark:text-blue-300">{String(value)}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      ) : (
        /* ── Teleprompter ── */
        <div className="flex flex-1 overflow-hidden">
          {/* Left: Section nav — SCRIPT sections only */}
          <div className="w-48 flex-shrink-0 border-r border-gray-100 dark:border-gray-800 overflow-y-auto p-2">
            {scriptSections.map((section, si) => {
              const sectionCompleted = (section.questions || []).filter(q => completedQuestions.has(q.id)).length;
              const isActive = si === currentSectionIdx;
              return (
                <button
                  key={section.id}
                  onClick={() => { setCurrentSectionIdx(si); setCurrentQuestionIdx(0); }}
                  className={`w-full text-left px-2.5 py-2 rounded-xl mb-1 transition-colors ${
                    isActive ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900' : 'hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wide truncate">{section.sectionLabel}</span>
                    {!section.questions?.some(q => q.isCore) && (
                      <span className={`text-[9px] px-1 rounded font-bold ml-1 flex-shrink-0 ${isActive ? 'bg-white/20 text-white' : 'bg-amber-100 text-amber-700'}`}>30%</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 mt-0.5">
                    <span className={`text-[10px] ${isActive ? 'text-gray-300' : 'text-gray-400'}`}>
                      {sectionCompleted}/{(section.questions || []).length}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Center: Current question — SCRIPT only */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {currentSection && (
              <div className="px-4 py-2 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
                <div className="flex items-center gap-2">
                  <MessageSquare className="w-3.5 h-3.5 text-gray-500 dark:text-gray-400" />
                  <span className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
                    {currentSection.sectionLabel}
                  </span>
                  {/* Show 30% badge for personalized sections */}
                  {currentSection.questions && !currentSection.questions.some(q => q.isCore) && (
                    <span className="text-[10px] font-bold text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 px-2 py-0.5 rounded-full">
                      Personalized 30%
                    </span>
                  )}
                  {currentSection.questions && currentSection.questions.some(q => q.isCore) && (
                    <span className="text-[10px] font-semibold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 px-2 py-0.5 rounded-full">
                      Standard 70%
                    </span>
                  )}
                </div>
              </div>
            )}

            <div className="flex-1 overflow-y-auto p-4">
              {currentQuestion ? (
                <div>
                  {/* Question — SCRIPT style (read aloud) */}
                  <div className="rounded-2xl p-5 mb-4 bg-gray-900 dark:bg-white">
                    <div className="flex items-start gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          {currentQuestion.isCore && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-white/20 text-white dark:text-gray-900 dark:bg-gray-900/20">
                              <Shield className="w-3 h-3" /> Core
                            </span>
                          )}
                          {currentQuestion.isLocked && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-white/10 text-gray-300 dark:text-gray-600 dark:bg-gray-900/10">
                              <Lock className="w-3 h-3" /> Locked
                            </span>
                          )}
                          {!currentQuestion.isCore && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/30 text-amber-200 dark:text-amber-700">
                              Personalized
                            </span>
                          )}
                        </div>
                        <p className="text-lg font-semibold leading-relaxed text-white dark:text-gray-900">
                          {currentQuestion.questionText}
                        </p>
                        {currentQuestion.resumeBasis && currentQuestion.resumeBasis !== 'Standard TRAVLR question' && (
                          <p className="text-xs mt-2 italic text-gray-300 dark:text-gray-600">
                            Resume basis: {currentQuestion.resumeBasis}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Listen for */}
                  {currentQuestion.listenFor && currentQuestion.listenFor.length > 0 && (
                    <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-3 mb-3">
                      <p className="text-[10px] font-semibold text-blue-700 dark:text-blue-400 uppercase tracking-wide mb-1.5">Listen For</p>
                      <ul className="space-y-1">
                        {currentQuestion.listenFor.map((item, i) => (
                          <li key={i} className="text-xs text-blue-800 dark:text-blue-300 flex items-start gap-1.5">
                            <Target className="w-3 h-3 text-blue-500 flex-shrink-0 mt-0.5" />
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Interviewer note */}
                  {currentQuestion.interviewerNote && (
                    <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-700 rounded-xl p-3 mb-3">
                      <div className="flex items-center gap-1.5 mb-1">
                        <EyeOff className="w-3 h-3 text-amber-500" />
                        <p className="text-[10px] font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wide">Interviewer Note (Private)</p>
                      </div>
                      <p className="text-xs text-amber-800 dark:text-amber-300">{currentQuestion.interviewerNote}</p>
                    </div>
                  )}

                  {/* Follow-ups */}
                  {currentQuestion.followUps && currentQuestion.followUps.length > 0 && (
                    <div className="mb-3">
                      <button
                        onClick={() => setExpandedFollowUps(prev => {
                          const next = new Set(prev);
                          if (next.has(currentQuestion.id)) next.delete(currentQuestion.id);
                          else next.add(currentQuestion.id);
                          return next;
                        })}
                        className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors mb-2"
                      >
                        {expandedFollowUps.has(currentQuestion.id) ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        {currentQuestion.followUps.length} Follow-Up{currentQuestion.followUps.length > 1 ? 's' : ''}
                      </button>
                      {expandedFollowUps.has(currentQuestion.id) && (
                        <div className="space-y-2 pl-3 border-l-2 border-gray-200 dark:border-gray-700">
                          {currentQuestion.followUps.map((fu, i) => (
                            <div key={i} className="flex items-start gap-2">
                              <ChevronRight className="w-3.5 h-3.5 text-gray-400 flex-shrink-0 mt-0.5" />
                              <p className="text-sm text-gray-700 dark:text-gray-300">{fu}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Ask Deeper */}
                  <div className="mb-3">
                    <button
                      onClick={handleAskDeeper}
                      disabled={askDeeperLoading}
                      className="flex items-center gap-1.5 px-3 py-2 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-xl text-xs font-semibold text-purple-700 dark:text-purple-400 hover:bg-purple-100 dark:hover:bg-purple-900/30 transition-colors disabled:opacity-50"
                    >
                      {askDeeperLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                      Ask Deeper
                    </button>
                    {askDeeperResult && (
                      <div className="mt-2 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-xl p-3">
                        <p className="text-[10px] font-semibold text-purple-700 dark:text-purple-400 uppercase tracking-wide mb-1">AI Follow-Up Suggestion</p>
                        <p className="text-sm text-purple-800 dark:text-purple-300 font-medium">{askDeeperResult}</p>
                      </div>
                    )}
                  </div>

                  {/* Notes */}
                  <div>
                    <label className="block text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">
                      Interview Notes
                    </label>
                    <div className="relative">
                      <textarea
                        value={notes[currentQuestion.id] || ''}
                        onChange={e => setNotes(prev => ({ ...prev, [currentQuestion.id]: e.target.value }))}
                        onBlur={() => {
                          const note = notes[currentQuestion.id];
                          if (note) saveNote(currentQuestion.id, currentQuestion.questionText, note);
                        }}
                        rows={3}
                        className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 text-sm text-gray-900 dark:text-white bg-white dark:bg-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900 dark:focus:ring-white resize-none"
                        placeholder="Notes for this question..."
                      />
                      {savingNote === currentQuestion.id && (
                        <div className="absolute top-2 right-2">
                          <Loader2 className="w-3.5 h-3.5 text-gray-400 animate-spin" />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-center py-12">
                  <CheckCircle className="w-10 h-10 text-green-500 mb-3" />
                  <p className="text-base font-bold text-gray-900 dark:text-white">Section Complete</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Move to the next section</p>
                </div>
              )}
            </div>

            {/* Navigation */}
            <div className="border-t border-gray-100 dark:border-gray-800 p-3 flex items-center gap-2 flex-shrink-0">
              <button
                onClick={prevQuestion}
                disabled={currentSectionIdx === 0 && currentQuestionIdx === 0}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 text-xs font-semibold hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors disabled:opacity-40"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Previous
              </button>

              <div className="flex gap-1.5 flex-1 justify-center">
                <button
                  onClick={() => {
                    if (currentQuestion) setCompletedQuestions(prev => new Set([...prev, currentQuestion.id]));
                    nextQuestion();
                  }}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-xs font-semibold hover:bg-green-200 dark:hover:bg-green-900/50 transition-colors"
                >
                  <ThumbsUp className="w-3.5 h-3.5" />
                  Good Answer
                </button>
                <button
                  onClick={nextQuestion}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 text-xs font-semibold hover:bg-amber-200 dark:hover:bg-amber-900/50 transition-colors"
                >
                  <AlertCircle className="w-3.5 h-3.5" />
                  Needs Follow-Up
                </button>
                <button
                  onClick={nextQuestion}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 text-xs font-semibold hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                >
                  <SkipForward className="w-3.5 h-3.5" />
                  Skip
                </button>
              </div>

              <button
                onClick={nextQuestion}
                disabled={currentSectionIdx === scriptSections.length - 1 && currentQuestionIdx >= currentSectionQuestions.length - 1}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-xs font-semibold hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors disabled:opacity-40"
              >
                Next
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Role-Play Panel ──────────────────────────────────────────────────────────

function RolePlaysPanel({ rolePlays }: { rolePlays: RolePlay[] }) {
  const [activeIdx, setActiveIdx] = useState(0);
  const rp = rolePlays[activeIdx];

  if (!rp) return null;

  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 p-4">
      <div className="flex items-center gap-2 mb-3">
        <MessageSquare className="w-4 h-4 text-gray-700 dark:text-gray-300" />
        <h3 className="text-sm font-bold text-gray-900 dark:text-white">Role-Play Scenarios</h3>
        <div className="flex gap-1 ml-auto">
          {rolePlays.map((_, i) => (
            <button
              key={i}
              onClick={() => setActiveIdx(i)}
              className={`w-6 h-6 rounded-full text-xs font-bold transition-colors ${
                i === activeIdx ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900' : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'
              }`}
            >
              {i + 1}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3 mb-3">
        <p className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Scenario</p>
        <p className="text-xs text-gray-700 dark:text-gray-300">{rp.scenario}</p>
      </div>

      <div className="bg-gray-900 dark:bg-white rounded-xl p-4 mb-3">
        <p className="text-[10px] font-semibold text-gray-300 dark:text-gray-600 uppercase tracking-wide mb-1">Homeowner Says:</p>
        <p className="text-base font-semibold text-white dark:text-gray-900 italic">&ldquo;{rp.homeownerLine}&rdquo;</p>
      </div>

      {rp.watchFor && rp.watchFor.length > 0 && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-3">
          <div className="flex items-center gap-1.5 mb-1.5">
            <EyeOff className="w-3.5 h-3.5 text-amber-500" />
            <p className="text-[10px] font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wide">Interviewer: Watch For (Private)</p>
          </div>
          <ul className="space-y-1">
            {rp.watchFor.map((item, i) => (
              <li key={i} className="text-xs text-amber-800 dark:text-amber-300 flex items-start gap-1.5">
                <Eye className="w-3 h-3 text-amber-500 flex-shrink-0 mt-0.5" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ─── Main Interview Mode Page ─────────────────────────────────────────────────

export default function InterviewModePage() {
  const { user, loading: authLoading, role } = useAuth();
  const router = useRouter();
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(null);
  const [loadingCandidates, setLoadingCandidates] = useState(true);
  const [loadingCandidate, setLoadingCandidate] = useState(false);
  const [generatingScript, setGeneratingScript] = useState(false);
  const [activeTab, setActiveTab] = useState<'teleprompter' | 'roleplays' | 'upload'>('teleprompter');
  const [showUpload, setShowUpload] = useState(false);
  const canAccessInterviewMode = role === 'admin' || role === 'owner';

  const fetchCandidates = useCallback(async () => {
    if (!user || !canAccessInterviewMode) return;
    setLoadingCandidates(true);
    try {
      const res = await fetch('/api/candidates');
      const data = await res.json();
      setCandidates(data.candidates || []);
    } catch (err) {
      console.error('[fetchCandidates]', err);
    } finally {
      setLoadingCandidates(false);
    }
  }, [canAccessInterviewMode, user]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace('/login');
      return;
    }
    if (!canAccessInterviewMode) {
      router.replace('/teleprompter');
      return;
    }
    fetchCandidates();
  }, [authLoading, canAccessInterviewMode, fetchCandidates, router, user]);

  const fetchCandidate = useCallback(async (id: string) => {
    setLoadingCandidate(true);
    try {
      const res = await fetch(`/api/candidates/${id}`);
      const data = await res.json();
      setSelectedCandidate(data.candidate || null);
    } catch (err) {
      console.error('[fetchCandidate]', err);
    } finally {
      setLoadingCandidate(false);
    }
  }, []);

  useEffect(() => {
    if (selectedCandidateId) fetchCandidate(selectedCandidateId);
  }, [selectedCandidateId, fetchCandidate]);

  const handleGenerateScript = async () => {
    if (!selectedCandidateId) return;
    setGeneratingScript(true);
    try {
      const res = await fetch('/api/candidates/generate-script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ candidateId: selectedCandidateId, forceRegenerate: true }),
      });
      const data = await res.json();
      if (data.error) {
        toast.error(`Script generation failed: ${data.details || data.error}`);
      } else {
        toast.success('Interview script generated');
        await fetchCandidate(selectedCandidateId);
      }
    } catch {
      toast.error('Script generation failed');
    } finally {
      setGeneratingScript(false);
    }
  };

  const script = selectedCandidate?.interview_script;
  const rolePlays = script?.rolePlays || [];

  if (authLoading || !user || !canAccessInterviewMode) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
        <div className="flex flex-col items-center gap-3 text-center">
          <Loader2 className="w-8 h-8 text-gray-500 animate-spin" />
          <p className="text-sm text-gray-500">Loading interview workspace…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* Header */}
      <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-4 py-3">
        <div className="max-w-screen-2xl mx-auto flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-gray-900 dark:bg-white flex items-center justify-center">
            <Briefcase className="w-4 h-4 text-white dark:text-gray-900" />
          </div>
          <div>
            <h1 className="text-base font-bold text-gray-900 dark:text-white">Interview Mode</h1>
            <p className="text-xs text-gray-500 dark:text-gray-400">TRAVLR Personalized Interview Teleprompter · 70% Standard / 30% Personalized</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => setShowUpload(s => !s)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-colors ${
                showUpload ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
            >
              <Upload className="w-3.5 h-3.5" />
              Upload Resumes
            </button>
            <Link
              href="/candidate-profiles"
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 text-xs font-semibold hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            >
              <Users className="w-3.5 h-3.5" />
              All Candidates
            </Link>
          </div>
        </div>
      </div>

      <div className="max-w-screen-2xl mx-auto p-4">
        <div className="flex gap-4">
          {/* Left Panel */}
          <div className="w-80 flex-shrink-0 space-y-4">
            {/* Upload panel */}
            {showUpload && (
              <ResumeUploadPanel
                onUploadComplete={() => {
                  fetchCandidates();
                  setShowUpload(false);
                }}
              />
            )}

            {/* Candidate selector */}
            <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 p-4">
              <div className="flex items-center gap-2 mb-3">
                <Users className="w-4 h-4 text-gray-700 dark:text-gray-300" />
                <h3 className="text-sm font-bold text-gray-900 dark:text-white">Select Candidate</h3>
                <span className="text-xs text-gray-400 ml-auto">{candidates.length} candidates</span>
              </div>
              <CandidateDropdown
                candidates={candidates}
                selectedId={selectedCandidateId}
                onSelect={setSelectedCandidateId}
                loading={loadingCandidates}
              />
            </div>

            {/* Candidate Intelligence snapshot */}
            {selectedCandidate && !loadingCandidate && (
              <CandidateIntelligencePanel candidate={selectedCandidate} />
            )}

            {loadingCandidate && (
              <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 p-8 flex items-center justify-center">
                <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
              </div>
            )}
          </div>

          {/* Main Panel */}
          <div className="flex-1 min-w-0">
            {!selectedCandidate && !loadingCandidate ? (
              <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 p-12 flex flex-col items-center justify-center text-center">
                <div className="w-16 h-16 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-4">
                  <Users className="w-8 h-8 text-gray-400" />
                </div>
                <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Select a Candidate</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-6 max-w-sm">
                  Choose a candidate from the dropdown to view their personalized interview teleprompter.
                </p>
                <button
                  onClick={() => setShowUpload(true)}
                  className="flex items-center gap-2 px-4 py-2.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-xl text-sm font-semibold hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors"
                >
                  <Upload className="w-4 h-4" />
                  Upload Resumes to Get Started
                </button>
              </div>
            ) : selectedCandidate && (
              <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden" style={{ height: 'calc(100vh - 140px)' }}>
                {/* Candidate header */}
                <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-gray-900 dark:bg-white flex items-center justify-center flex-shrink-0">
                    <span className="text-sm font-bold text-white dark:text-gray-900">
                      {selectedCandidate.full_name.charAt(0)}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h2 className="text-sm font-bold text-gray-900 dark:text-white">{selectedCandidate.full_name}</h2>
                    <div className="flex items-center gap-2 mt-0.5">
                      <PriorityBadge priority={selectedCandidate.interview_priority} />
                      <StatusBadge status={selectedCandidate.candidate_status} />
                      {selectedCandidate.script_generated_at && (
                        <span className="text-[10px] text-gray-400">
                          Script: {new Date(selectedCandidate.script_generated_at).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Tabs */}
                  <div className="flex items-center gap-1">
                    {[
                      { id: 'teleprompter', label: 'Teleprompter', icon: MessageSquare },
                      { id: 'roleplays', label: 'Role-Plays', icon: Users },
                    ].map(tab => (
                      <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id as 'teleprompter' | 'roleplays')}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
                          activeTab === tab.id
                            ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                        }`}
                      >
                        <tab.icon className="w-3.5 h-3.5" />
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  {/* Script controls */}
                  <div className="flex items-center gap-1.5">
                    {!selectedCandidate.interview_script ? (
                      <button
                        onClick={handleGenerateScript}
                        disabled={generatingScript}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-xl text-xs font-semibold hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors disabled:opacity-50"
                      >
                        {generatingScript ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Brain className="w-3.5 h-3.5" />}
                        {generatingScript ? 'Generating...' : 'Generate Script'}
                      </button>
                    ) : (
                      <button
                        onClick={handleGenerateScript}
                        disabled={generatingScript}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded-xl text-xs font-semibold hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
                        title="Regenerate interview script"
                      >
                        {generatingScript ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                        Regenerate
                      </button>
                    )}
                  </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-hidden" style={{ height: 'calc(100% - 65px)' }}>
                  {!selectedCandidate.interview_script && !generatingScript ? (
                    <div className="flex flex-col items-center justify-center h-full text-center p-8">
                      <Brain className="w-12 h-12 text-gray-300 dark:text-gray-600 mb-4" />
                      <h3 className="text-base font-bold text-gray-900 dark:text-white mb-2">No Interview Script Yet</h3>
                      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4 max-w-sm">
                        {selectedCandidate.resume_raw_text
                          ? 'Resume uploaded. Click "Generate Script" to create a personalized interview teleprompter using Anthropic AI.' :'Upload a resume first, then generate a personalized interview script.'}
                      </p>
                      {selectedCandidate.resume_raw_text && (
                        <button
                          onClick={handleGenerateScript}
                          className="flex items-center gap-2 px-4 py-2.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-xl text-sm font-semibold hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors"
                        >
                          <Brain className="w-4 h-4" />
                          Generate Personalized Script
                        </button>
                      )}
                      {!selectedCandidate.resume_raw_text && selectedCandidate.seed_fit_notes && (
                        <div className="mt-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4 max-w-sm text-left">
                          <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 mb-1">Seed Context Available</p>
                          <p className="text-xs text-amber-800 dark:text-amber-300">{selectedCandidate.seed_fit_notes}</p>
                          <button
                            onClick={handleGenerateScript}
                            className="mt-3 flex items-center gap-1.5 px-3 py-2 bg-amber-700 text-white rounded-xl text-xs font-semibold hover:bg-amber-800 transition-colors"
                          >
                            <Brain className="w-3.5 h-3.5" />
                            Generate from Seed Context
                          </button>
                        </div>
                      )}
                    </div>
                  ) : generatingScript ? (
                    <div className="flex flex-col items-center justify-center h-full text-center p-8">
                      <Loader2 className="w-10 h-10 text-gray-400 animate-spin mb-4" />
                      <h3 className="text-base font-bold text-gray-900 dark:text-white mb-2">Generating Personalized Script</h3>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        Anthropic is analyzing {selectedCandidate.full_name}&apos;s resume and creating a tailored interview teleprompter...
                      </p>
                    </div>
                  ) : activeTab === 'teleprompter' ? (
                    <InterviewTeleprompter
                      candidate={selectedCandidate}
                      onClose={() => setSelectedCandidateId(null)}
                    />
                  ) : activeTab === 'roleplays' && rolePlays.length > 0 ? (
                    <div className="p-4 overflow-y-auto h-full">
                      <RolePlaysPanel rolePlays={rolePlays} />
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full text-center p-8">
                      <MessageSquare className="w-10 h-10 text-gray-300 dark:text-gray-600 mb-3" />
                      <p className="text-sm text-gray-500 dark:text-gray-400">No role-plays in this script</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
