'use client';

import React, { useState, useEffect, useCallback, Suspense } from 'react';
import AppLayout from '@/components/AppLayout';
import Link from 'next/link';
import { ChevronDown, ChevronUp, CheckCircle, AlertCircle, Clock, HelpCircle, Lightbulb, MessageSquare, ArrowRight, RefreshCw, Loader2, FileText, Star, AlertTriangle, ChevronRight, Users, Zap, BookOpen, Target } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import Icon from '@/components/ui/AppIcon';


// ─── Types ────────────────────────────────────────────────────────────────────

interface ConsistencyClaim {
  resumeClaim: string;
  resumeEvidence: string;
  interviewEvidence: string;
  status: 'VALIDATED' | 'PARTIALLY_VALIDATED' | 'NOT_YET_VALIDATED' | 'NEEDS_CLARIFICATION';
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  analysis: string;
}

interface NextStepTopic {
  topic: string;
  priority: 'HIGH' | 'MEDIUM' | 'OPTIONAL';
  reason: string;
}

interface ConsistencyReport {
  id: string;
  candidate_id: string;
  executive_summary: string;
  validated_claims: ConsistencyClaim[];
  partially_validated_claims: ConsistencyClaim[];
  not_yet_validated: ConsistencyClaim[];
  needs_clarification: ConsistencyClaim[];
  new_information: string[];
  unanswered_questions: string[];
  role_gaps: string[];
  strongest_interview_evidence: string[];
  next_step_topics: NextStepTopic[];
  second_interview_questions: string[];
  generation_status: string;
  generated_at?: string;
  model?: string;
}

interface Candidate {
  id: string;
  full_name: string;
  candidate_rank?: number;
  interview_priority?: string;
  candidate_status?: string;
  consistency_report_status?: string;
  current_title?: string;
}

// ─── Status Config ────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  VALIDATED: { label: 'Validated', color: 'bg-green-100 text-green-700 border-green-200', icon: CheckCircle, dot: 'bg-green-500' },
  PARTIALLY_VALIDATED: { label: 'Partially Validated', color: 'bg-amber-100 text-amber-700 border-amber-200', icon: AlertCircle, dot: 'bg-amber-500' },
  NOT_YET_VALIDATED: { label: 'Not Yet Validated', color: 'bg-gray-100 text-gray-600 border-gray-200', icon: Clock, dot: 'bg-gray-400' },
  NEEDS_CLARIFICATION: { label: 'Needs Clarification', color: 'bg-red-100 text-red-700 border-red-200', icon: HelpCircle, dot: 'bg-red-400' },
};

const PRIORITY_CONFIG = {
  HIGH: { color: 'bg-red-100 text-red-700', label: 'HIGH PRIORITY' },
  MEDIUM: { color: 'bg-amber-100 text-amber-700', label: 'MEDIUM' },
  OPTIONAL: { color: 'bg-gray-100 text-gray-600', label: 'OPTIONAL' },
};

const CONFIDENCE_CONFIG = {
  HIGH: 'text-green-600',
  MEDIUM: 'text-amber-600',
  LOW: 'text-gray-500',
};

// ─── Expandable Section ───────────────────────────────────────────────────────

function ExpandableSection({
  title,
  count,
  children,
  defaultOpen = false,
  icon: Icon,
  accentColor = 'border-gray-200',
}: {
  title: string;
  count?: number;
  children: React.ReactNode;
  defaultOpen?: boolean;
  icon: React.ElementType;
  accentColor?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={`bg-white border ${accentColor} rounded-2xl overflow-hidden`}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <Icon className="w-4 h-4 text-gray-500" />
          <span className="font-semibold text-gray-900 text-sm">{title}</span>
          {count !== undefined && (
            <span className="w-5 h-5 rounded-full bg-gray-100 text-gray-600 text-xs font-bold flex items-center justify-center">{count}</span>
          )}
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
      </button>
      {open && <div className="px-5 pb-5 border-t border-gray-100">{children}</div>}
    </div>
  );
}

// ─── Claim Card ───────────────────────────────────────────────────────────────

function ClaimCard({ claim }: { claim: ConsistencyClaim }) {
  const [expanded, setExpanded] = useState(false);
  const config = STATUS_CONFIG[claim.status];
  const StatusIcon = config.icon;

  return (
    <div className="border border-gray-100 rounded-xl p-4 hover:border-gray-200 transition-colors">
      <div className="flex items-start gap-3">
        <span className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${config.dot}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1.5">
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${config.color}`}>
              <StatusIcon className="w-3 h-3" />
              {config.label}
            </span>
            <span className={`text-[11px] font-medium ${CONFIDENCE_CONFIG[claim.confidence]}`}>
              {claim.confidence} confidence
            </span>
          </div>
          <p className="text-sm font-semibold text-gray-900 mb-1">{claim.resumeClaim}</p>
          {claim.resumeEvidence && (
            <p className="text-xs text-gray-500 mb-1"><span className="font-medium text-gray-700">Resume: </span>{claim.resumeEvidence}</p>
          )}
          {claim.interviewEvidence && (
            <p className="text-xs text-gray-500 mb-1"><span className="font-medium text-gray-700">Interview: </span>{claim.interviewEvidence}</p>
          )}
          {claim.analysis && (
            <button onClick={() => setExpanded(!expanded)} className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1 mt-1">
              {expanded ? 'Hide' : 'Show'} analysis
              <ChevronRight className={`w-3 h-3 transition-transform ${expanded ? 'rotate-90' : ''}`} />
            </button>
          )}
          {expanded && claim.analysis && (
            <p className="text-xs text-gray-600 mt-2 bg-gray-50 rounded-lg p-3 leading-relaxed">{claim.analysis}</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Inner Content (uses useSearchParams) ────────────────────────────────────

function ConsistencyReportContent() {
  const searchParams = useSearchParams();
  const candidateIdParam = searchParams.get('candidateId');

  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string>(candidateIdParam || '');
  const [report, setReport] = useState<ConsistencyReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/candidates')
      .then(r => r.json())
      .then(d => {
        setCandidates(d.candidates || []);
        if (!selectedCandidateId && d.candidates?.length > 0) {
          setSelectedCandidateId(d.candidates[0].id);
        }
      })
      .catch(() => {});
  }, [selectedCandidateId]);

  const loadReport = useCallback(async (candidateId: string) => {
    if (!candidateId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/candidates/consistency-report?candidateId=${candidateId}`);
      const data = await res.json();
      setReport(data.report || null);
    } catch {
      setError('Failed to load report');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedCandidateId) loadReport(selectedCandidateId);
  }, [selectedCandidateId, loadReport]);

  const generateReport = async () => {
    if (!selectedCandidateId) return;
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch('/api/candidates/consistency-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ candidateId: selectedCandidateId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Generation failed');
      setReport(data.report);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate report');
    } finally {
      setGenerating(false);
    }
  };

  const selectedCandidate = candidates.find(c => c.id === selectedCandidateId);

  return (
    <AppLayout>
      <div className="min-h-screen bg-gray-50 p-4 sm:p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <FileText className="w-5 h-5 text-gray-700" />
              <h1 className="text-2xl font-bold text-gray-900">Resume vs. Interview</h1>
            </div>
            <p className="text-sm text-gray-500">Post-interview consistency analysis · AI advisory only · Human decisions remain primary</p>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/candidate-pipeline" className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50">
              <Users className="w-3.5 h-3.5" />Pipeline
            </Link>
            <Link href="/interview-mode-qa" className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50">
              <Zap className="w-3.5 h-3.5" />Batch QA
            </Link>
          </div>
        </div>

        {/* Candidate Selector */}
        <div className="bg-white border border-gray-200 rounded-2xl p-4 mb-5">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex-1 min-w-[200px]">
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">Select Candidate</label>
              <select
                value={selectedCandidateId}
                onChange={e => setSelectedCandidateId(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-gray-900"
              >
                <option value="">— Select a candidate —</option>
                {candidates.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.candidate_rank ? `#${c.candidate_rank} · ` : ''}{c.full_name}
                    {c.consistency_report_status === 'COMPLETED' ? ' ✓' : ''}
                  </option>
                ))}
              </select>
            </div>
            {selectedCandidate && (
              <div className="flex items-center gap-3">
                <div>
                  <p className="text-sm font-bold text-gray-900">{selectedCandidate.full_name}</p>
                  <p className="text-xs text-gray-500">{selectedCandidate.current_title || selectedCandidate.interview_priority?.replace(/_/g, ' ')}</p>
                </div>
                <button
                  onClick={generateReport}
                  disabled={generating}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gray-900 text-white text-sm font-semibold hover:bg-gray-800 disabled:opacity-50 transition-colors"
                >
                  {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                  {report ? 'Regenerate Report' : 'Generate Report'}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4 mb-5 flex items-start gap-3">
            <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-red-800">Report generation failed</p>
              <p className="text-xs text-red-600 mt-0.5">{error}</p>
              <p className="text-xs text-red-500 mt-1">Interview data is preserved. You can retry the analysis.</p>
            </div>
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-gray-300 border-t-gray-900 rounded-full animate-spin" />
          </div>
        )}

        {!loading && !report && selectedCandidateId && !generating && (
          <div className="bg-white border border-gray-200 rounded-2xl p-12 text-center">
            <FileText className="w-10 h-10 text-gray-300 mx-auto mb-4" />
            <h3 className="text-base font-semibold text-gray-700 mb-1">No consistency report yet</h3>
            <p className="text-sm text-gray-400 mb-5">Complete the interview and scorecard, then generate the report.</p>
            <button
              onClick={generateReport}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gray-900 text-white text-sm font-semibold hover:bg-gray-800 transition-colors"
            >
              <Zap className="w-4 h-4" />Generate Report
            </button>
          </div>
        )}

        {generating && (
          <div className="bg-white border border-gray-200 rounded-2xl p-12 text-center">
            <Loader2 className="w-10 h-10 text-gray-400 mx-auto mb-4 animate-spin" />
            <h3 className="text-base font-semibold text-gray-700 mb-1">Generating consistency report…</h3>
            <p className="text-sm text-gray-400">Anthropic is analyzing resume evidence against interview notes and scorecard.</p>
          </div>
        )}

        {!loading && !generating && report && report.generation_status === 'COMPLETED' && (
          <div className="space-y-4">
            {/* Summary bar */}
            <div className="bg-white border border-gray-200 rounded-2xl p-5">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <BookOpen className="w-4 h-4 text-gray-500" />
                    <h2 className="text-sm font-bold text-gray-900">Executive Summary</h2>
                    {report.generated_at && (
                      <span className="text-xs text-gray-400">· Generated {new Date(report.generated_at).toLocaleDateString()}</span>
                    )}
                  </div>
                  <p className="text-sm text-gray-700 leading-relaxed">{report.executive_summary}</p>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <div className="text-center">
                    <p className="text-2xl font-bold text-green-700">{report.validated_claims?.length || 0}</p>
                    <p className="text-[10px] text-gray-500">Validated</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-amber-600">{report.partially_validated_claims?.length || 0}</p>
                    <p className="text-[10px] text-gray-500">Partial</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-gray-500">{report.not_yet_validated?.length || 0}</p>
                    <p className="text-[10px] text-gray-500">Not Yet</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-red-600">{report.needs_clarification?.length || 0}</p>
                    <p className="text-[10px] text-gray-500">Clarify</p>
                  </div>
                </div>
              </div>
            </div>

            {(report.validated_claims?.length || 0) > 0 && (
              <ExpandableSection title="Validated Resume Claims" count={report.validated_claims.length} icon={CheckCircle} accentColor="border-green-200" defaultOpen>
                <div className="space-y-3 mt-4">
                  {report.validated_claims.map((claim, i) => <ClaimCard key={i} claim={claim} />)}
                </div>
              </ExpandableSection>
            )}

            {(report.partially_validated_claims?.length || 0) > 0 && (
              <ExpandableSection title="Partially Validated Claims" count={report.partially_validated_claims.length} icon={AlertCircle} accentColor="border-amber-200" defaultOpen>
                <div className="space-y-3 mt-4">
                  {report.partially_validated_claims.map((claim, i) => <ClaimCard key={i} claim={claim} />)}
                </div>
              </ExpandableSection>
            )}

            {(report.not_yet_validated?.length || 0) > 0 && (
              <ExpandableSection title="Not Yet Validated" count={report.not_yet_validated.length} icon={Clock} accentColor="border-gray-200">
                <p className="text-xs text-gray-500 mt-3 mb-3 italic">These claims were not explored in the interview — they are not false, just not yet tested.</p>
                <div className="space-y-3">
                  {report.not_yet_validated.map((claim, i) => <ClaimCard key={i} claim={claim} />)}
                </div>
              </ExpandableSection>
            )}

            {(report.needs_clarification?.length || 0) > 0 && (
              <ExpandableSection title="Potential Inconsistencies / Needs Clarification" count={report.needs_clarification.length} icon={HelpCircle} accentColor="border-red-200" defaultOpen>
                <p className="text-xs text-gray-500 mt-3 mb-3 italic">Neutral language only — these are areas to clarify, not accusations.</p>
                <div className="space-y-3">
                  {report.needs_clarification.map((claim, i) => <ClaimCard key={i} claim={claim} />)}
                </div>
              </ExpandableSection>
            )}

            {(report.new_information?.length || 0) > 0 && (
              <ExpandableSection title="New Information Learned" count={report.new_information.length} icon={Lightbulb} accentColor="border-blue-200" defaultOpen>
                <ul className="mt-4 space-y-2">
                  {report.new_information.map((item, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-2 flex-shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              </ExpandableSection>
            )}

            {(report.unanswered_questions?.length || 0) > 0 && (
              <ExpandableSection title="Unanswered Questions" count={report.unanswered_questions.length} icon={HelpCircle} accentColor="border-orange-200" defaultOpen>
                <ul className="mt-4 space-y-2">
                  {report.unanswered_questions.map((q, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-gray-700 bg-orange-50 rounded-xl px-3 py-2.5">
                      <HelpCircle className="w-4 h-4 text-orange-500 flex-shrink-0 mt-0.5" />
                      {q}
                    </li>
                  ))}
                </ul>
              </ExpandableSection>
            )}

            {(report.strongest_interview_evidence?.length || 0) > 0 && (
              <ExpandableSection title="Strongest Interview Evidence" count={report.strongest_interview_evidence.length} icon={Star} accentColor="border-green-200">
                <ul className="mt-4 space-y-2">
                  {report.strongest_interview_evidence.map((item, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                      <Star className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                      {item}
                    </li>
                  ))}
                </ul>
              </ExpandableSection>
            )}

            {(report.role_gaps?.length || 0) > 0 && (
              <ExpandableSection title="Role-Specific Gaps" count={report.role_gaps.length} icon={Target} accentColor="border-gray-200">
                <ul className="mt-4 space-y-2">
                  {report.role_gaps.map((gap, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                      <span className="w-1.5 h-1.5 rounded-full bg-gray-400 mt-2 flex-shrink-0" />
                      {gap}
                    </li>
                  ))}
                </ul>
              </ExpandableSection>
            )}

            {(report.next_step_topics?.length || 0) > 0 && (
              <ExpandableSection title="Suggested Next-Step Topics" count={report.next_step_topics.length} icon={ArrowRight} accentColor="border-blue-200" defaultOpen>
                <div className="mt-4 space-y-2">
                  {report.next_step_topics.map((topic, i) => {
                    const pConfig = PRIORITY_CONFIG[topic.priority] || PRIORITY_CONFIG.OPTIONAL;
                    return (
                      <div key={i} className="flex items-start gap-3 p-3 rounded-xl border border-gray-100">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 mt-0.5 ${pConfig.color}`}>{pConfig.label}</span>
                        <div>
                          <p className="text-sm font-semibold text-gray-900">{topic.topic}</p>
                          {topic.reason && <p className="text-xs text-gray-500 mt-0.5">{topic.reason}</p>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </ExpandableSection>
            )}

            {(report.second_interview_questions?.length || 0) > 0 && (
              <ExpandableSection title="Second Interview Questions" count={report.second_interview_questions.length} icon={MessageSquare} accentColor="border-purple-200" defaultOpen>
                <p className="text-xs text-gray-500 mt-3 mb-3 italic">Based on remaining uncertainty from resume + first interview evidence. Not a repeat of the first interview.</p>
                <ol className="space-y-2">
                  {report.second_interview_questions.map((q, i) => (
                    <li key={i} className="flex items-start gap-3 p-3 rounded-xl bg-purple-50 border border-purple-100">
                      <span className="w-5 h-5 rounded-full bg-purple-200 text-purple-700 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">{i + 1}</span>
                      <p className="text-sm text-gray-800">{q}</p>
                    </li>
                  ))}
                </ol>
              </ExpandableSection>
            )}

            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3">
              <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-800">
                <span className="font-semibold">AI Advisory Only.</span> This report is generated from interview notes and scorecard data. Final employment decisions — including Move Forward or Not Moving Forward — must be made by an authorized human. Anthropic does not determine hiring outcomes.
              </p>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}

// ─── Page with Suspense boundary ─────────────────────────────────────────────

export default function ConsistencyReportPage() {
  return (
    <Suspense fallback={
      <AppLayout>
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-gray-300 border-t-gray-900 rounded-full animate-spin" />
        </div>
      </AppLayout>
    }>
      <ConsistencyReportContent />
    </Suspense>
  );
}
