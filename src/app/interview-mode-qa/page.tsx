'use client';

import React, { useState, useEffect, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import Link from 'next/link';
import { Zap, Loader2, CheckCircle, AlertTriangle, XCircle, ChevronDown, ChevronUp, Users, FileText, BarChart2, Eye, Shield, Search, Play, Clock, Info } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface QAResult {
  candidateId: string;
  candidateName: string;
  resumeParsed: boolean;
  specificQuestionsCount: number;
  evidenceBackedCount: number;
  missingEvidenceCount: number;
  nearDuplicateCount: number;
  crossCandidateLeakage: boolean;
  personalizationPct: number;
  qaStatus: 'PASS' | 'WARN' | 'FAIL';
  coreQuestionsCount: number;
  candidateSpecificQuestions: Array<{
    question: string;
    resumeBasis: string;
    hasEvidence: boolean;
    evidenceStrength: 'STRONG' | 'MODERATE' | 'WEAK' | 'MISSING';
  }>;
  duplicateMatches: Array<{ question: string; matchedWith: string; similarity: number }>;
  leakageDetails: string[];
  warnReasons: string[];
  failReasons: string[];
}

interface QASummary {
  totalCandidates: number;
  pass: number;
  warn: number;
  fail: number;
  crossCandidateLeakageDetected: boolean;
  averagePersonalizationPct: number;
  runAt: string;
}

// ─── Status Config ────────────────────────────────────────────────────────────

const QA_STATUS_CONFIG = {
  PASS: { label: 'PASS', color: 'bg-green-100 text-green-700 border-green-200', icon: CheckCircle, dot: 'bg-green-500', rowBg: 'bg-green-50/30' },
  WARN: { label: 'WARN', color: 'bg-amber-100 text-amber-700 border-amber-200', icon: AlertTriangle, dot: 'bg-amber-500', rowBg: 'bg-amber-50/30' },
  FAIL: { label: 'FAIL', color: 'bg-red-100 text-red-700 border-red-200', icon: XCircle, dot: 'bg-red-500', rowBg: 'bg-red-50/30' },
};

const EVIDENCE_COLORS = {
  STRONG: 'text-green-700 bg-green-50',
  MODERATE: 'text-amber-700 bg-amber-50',
  WEAK: 'text-orange-700 bg-orange-50',
  MISSING: 'text-red-700 bg-red-50',
};

// ─── Candidate QA Detail ──────────────────────────────────────────────────────

function CandidateQADetail({ result }: { result: QAResult }) {
  const [open, setOpen] = useState(false);
  const config = QA_STATUS_CONFIG[result.qaStatus];
  const StatusIcon = config.icon;

  return (
    <div className={`border rounded-2xl overflow-hidden transition-all ${result.qaStatus === 'FAIL' ? 'border-red-200' : result.qaStatus === 'WARN' ? 'border-amber-200' : 'border-gray-200'}`}>
      {/* Row */}
      <button
        onClick={() => setOpen(!open)}
        className={`w-full flex items-center gap-4 px-5 py-4 hover:bg-gray-50 transition-colors text-left ${config.rowBg}`}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="font-bold text-gray-900 text-sm">{result.candidateName}</span>
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold border ${config.color}`}>
              <StatusIcon className="w-3 h-3" />
              {config.label}
            </span>
            {result.crossCandidateLeakage && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-700 border border-red-200">
                <Shield className="w-3 h-3" />LEAKAGE DETECTED
              </span>
            )}
          </div>
        </div>

        {/* Metrics */}
        <div className="hidden sm:flex items-center gap-6 text-xs text-gray-500 flex-shrink-0">
          <div className="text-center">
            <p className="font-bold text-gray-900">{result.resumeParsed ? '✓' : '✗'}</p>
            <p>Resume</p>
          </div>
          <div className="text-center">
            <p className="font-bold text-gray-900">{result.specificQuestionsCount}</p>
            <p>Specific Qs</p>
          </div>
          <div className="text-center">
            <p className={`font-bold ${result.evidenceBackedCount === result.specificQuestionsCount && result.specificQuestionsCount > 0 ? 'text-green-700' : 'text-amber-600'}`}>
              {result.evidenceBackedCount}
            </p>
            <p>Evidence-Backed</p>
          </div>
          <div className="text-center">
            <p className={`font-bold ${result.nearDuplicateCount > 3 ? 'text-red-600' : result.nearDuplicateCount > 0 ? 'text-amber-600' : 'text-green-700'}`}>
              {result.nearDuplicateCount}
            </p>
            <p>Near Dupes</p>
          </div>
          <div className="text-center">
            <p className={`font-bold ${result.personalizationPct >= 90 ? 'text-green-700' : result.personalizationPct >= 60 ? 'text-amber-600' : 'text-red-600'}`}>
              {result.personalizationPct}%
            </p>
            <p>Personalization</p>
          </div>
        </div>

        {open ? <ChevronUp className="w-4 h-4 text-gray-400 flex-shrink-0" /> : <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />}
      </button>

      {/* Detail */}
      {open && (
        <div className="px-5 pb-5 border-t border-gray-100 bg-white">
          {/* Warn/Fail reasons */}
          {result.failReasons.length > 0 && (
            <div className="mt-4 bg-red-50 border border-red-200 rounded-xl p-4">
              <p className="text-xs font-bold text-red-800 mb-2 flex items-center gap-1.5"><XCircle className="w-3.5 h-3.5" />FAIL Reasons</p>
              <ul className="space-y-1">
                {result.failReasons.map((r, i) => <li key={i} className="text-xs text-red-700">• {r}</li>)}
              </ul>
            </div>
          )}
          {result.warnReasons.length > 0 && (
            <div className="mt-4 bg-amber-50 border border-amber-200 rounded-xl p-4">
              <p className="text-xs font-bold text-amber-800 mb-2 flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" />WARN Reasons</p>
              <ul className="space-y-1">
                {result.warnReasons.map((r, i) => <li key={i} className="text-xs text-amber-700">• {r}</li>)}
              </ul>
            </div>
          )}

          {/* Leakage */}
          {result.leakageDetails.length > 0 && (
            <div className="mt-4 bg-red-50 border border-red-200 rounded-xl p-4">
              <p className="text-xs font-bold text-red-800 mb-2 flex items-center gap-1.5"><Shield className="w-3.5 h-3.5" />Cross-Candidate Context Leakage</p>
              <ul className="space-y-1">
                {result.leakageDetails.map((d, i) => <li key={i} className="text-xs text-red-700">• {d}</li>)}
              </ul>
            </div>
          )}

          {/* Candidate-specific questions */}
          {result.candidateSpecificQuestions.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-bold text-gray-700 mb-3">Candidate-Specific Questions ({result.candidateSpecificQuestions.length})</p>
              <div className="space-y-2">
                {result.candidateSpecificQuestions.map((q, i) => (
                  <div key={i} className="border border-gray-100 rounded-xl p-3">
                    <div className="flex items-start gap-2">
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 mt-0.5 ${EVIDENCE_COLORS[q.evidenceStrength]}`}>
                        {q.evidenceStrength}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-gray-800 font-medium">{q.question}</p>
                        {q.resumeBasis && q.resumeBasis !== 'Not specified' && (
                          <p className="text-[11px] text-gray-500 mt-1"><span className="font-medium">Basis: </span>{q.resumeBasis}</p>
                        )}
                        {!q.hasEvidence && (
                          <p className="text-[11px] text-red-600 mt-1">⚠ No resume evidence backing this question</p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Duplicate matches */}
          {result.duplicateMatches.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-bold text-gray-700 mb-3">Near-Duplicate Matches ({result.duplicateMatches.length})</p>
              <div className="space-y-2">
                {result.duplicateMatches.map((m, i) => (
                  <div key={i} className="border border-amber-200 rounded-xl p-3 bg-amber-50">
                    <p className="text-xs text-gray-800 font-medium mb-1">{m.question}</p>
                    <p className="text-[11px] text-amber-700">
                      <span className="font-semibold">{m.similarity}% similar to</span> {m.matchedWith}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function InterviewModeQAPage() {
  const [results, setResults] = useState<QAResult[]>([]);
  const [summary, setSummary] = useState<QASummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingExisting, setLoadingExisting] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'ALL' | 'PASS' | 'WARN' | 'FAIL'>('ALL');

  // Load existing QA results on mount
  const loadExisting = useCallback(async () => {
    setLoadingExisting(true);
    try {
      const res = await fetch('/api/candidates/batch-qa');
      const data = await res.json();
      if (data.results && data.results.length > 0) {
        // Group by candidateId, take latest per candidate
        const latestByCandidate = new Map<string, QAResult>();
        for (const r of data.results) {
          if (!latestByCandidate.has(r.candidate_id)) {
            latestByCandidate.set(r.candidate_id, {
              candidateId: r.candidate_id,
              candidateName: r.candidate_name || 'Unknown',
              resumeParsed: r.resume_parsed,
              specificQuestionsCount: r.specific_questions_count,
              evidenceBackedCount: r.evidence_backed_count,
              missingEvidenceCount: r.missing_evidence_count,
              nearDuplicateCount: r.near_duplicate_count,
              crossCandidateLeakage: r.cross_candidate_leakage,
              personalizationPct: r.personalization_pct,
              qaStatus: r.qa_status,
              coreQuestionsCount: r.core_questions_count,
              candidateSpecificQuestions: r.candidate_specific_questions || [],
              duplicateMatches: r.duplicate_matches || [],
              leakageDetails: r.leakage_details || [],
              warnReasons: r.warn_reasons || [],
              failReasons: r.fail_reasons || [],
            });
          }
        }
        const qaResults = Array.from(latestByCandidate.values());
        setResults(qaResults);
        setSummary({
          totalCandidates: qaResults.length,
          pass: qaResults.filter(r => r.qaStatus === 'PASS').length,
          warn: qaResults.filter(r => r.qaStatus === 'WARN').length,
          fail: qaResults.filter(r => r.qaStatus === 'FAIL').length,
          crossCandidateLeakageDetected: qaResults.some(r => r.crossCandidateLeakage),
          averagePersonalizationPct: qaResults.length > 0
            ? Math.round(qaResults.reduce((s, r) => s + r.personalizationPct, 0) / qaResults.length)
            : 0,
          runAt: new Date().toISOString(),
        });
      }
    } catch {
      // silent
    } finally {
      setLoadingExisting(false);
    }
  }, []);

  useEffect(() => { loadExisting(); }, [loadExisting]);

  const runBatchQA = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/candidates/batch-qa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ testExisting: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'QA failed');
      setResults(data.results || []);
      setSummary(data.summary || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Batch QA failed');
    } finally {
      setLoading(false);
    }
  };

  const filtered = filter === 'ALL' ? results : results.filter(r => r.qaStatus === filter);

  return (
    <AppLayout>
      <div className="min-h-screen bg-gray-50 p-4 sm:p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Zap className="w-5 h-5 text-gray-700" />
              <h1 className="text-2xl font-bold text-gray-900">Anthropic Interview QA</h1>
            </div>
            <p className="text-sm text-gray-500">Verify genuine resume-based personalization across all candidates · Detect cloned templates and cross-candidate leakage</p>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/candidate-pipeline" className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50">
              <Users className="w-3.5 h-3.5" />Pipeline
            </Link>
            <Link href="/consistency-report" className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50">
              <FileText className="w-3.5 h-3.5" />Consistency
            </Link>
          </div>
        </div>

        {/* Run QA Panel */}
        <div className="bg-white border border-gray-200 rounded-2xl p-5 mb-5">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h2 className="text-sm font-bold text-gray-900 mb-1">Candidate Personalization Test</h2>
              <p className="text-xs text-gray-500 max-w-lg">
                Tests all 8 candidates' generated interview scripts to ensure Anthropic used resume evidence rather than cloning one template.
                Detects exact duplicates, near-duplicates, name-swapped questions, and cross-candidate context leakage.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={loadExisting}
                disabled={loadingExisting}
                className="flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
              >
                {loadingExisting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
                Test Existing Scripts
              </button>
              <button
                onClick={runBatchQA}
                disabled={loading}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gray-900 text-white text-sm font-semibold hover:bg-gray-800 disabled:opacity-50 transition-colors"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                Run Candidate Personalization Test
              </button>
            </div>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4 mb-5 flex items-start gap-3">
            <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="bg-white border border-gray-200 rounded-2xl p-12 text-center mb-5">
            <Loader2 className="w-10 h-10 text-gray-400 mx-auto mb-4 animate-spin" />
            <h3 className="text-base font-semibold text-gray-700 mb-1">Running batch personalization test…</h3>
            <p className="text-sm text-gray-400">Analyzing all candidate scripts for genuine resume-based personalization.</p>
          </div>
        )}

        {/* Summary */}
        {summary && !loading && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-5">
              <div className="bg-white border border-gray-200 rounded-2xl p-4 text-center">
                <p className="text-2xl font-bold text-gray-900">{summary.totalCandidates}</p>
                <p className="text-xs text-gray-500 mt-0.5">Candidates Tested</p>
              </div>
              <div className="bg-green-50 border border-green-200 rounded-2xl p-4 text-center">
                <p className="text-2xl font-bold text-green-700">{summary.pass}</p>
                <p className="text-xs text-gray-500 mt-0.5">PASS</p>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-center">
                <p className="text-2xl font-bold text-amber-600">{summary.warn}</p>
                <p className="text-xs text-gray-500 mt-0.5">WARN</p>
              </div>
              <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-center">
                <p className="text-2xl font-bold text-red-600">{summary.fail}</p>
                <p className="text-xs text-gray-500 mt-0.5">FAIL</p>
              </div>
              <div className={`border rounded-2xl p-4 text-center ${summary.crossCandidateLeakageDetected ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'}`}>
                <p className={`text-2xl font-bold ${summary.crossCandidateLeakageDetected ? 'text-red-600' : 'text-green-700'}`}>
                  {summary.crossCandidateLeakageDetected ? 'YES' : 'NO'}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">Cross-Candidate Leakage</p>
              </div>
            </div>

            {/* Avg personalization */}
            <div className="bg-white border border-gray-200 rounded-2xl p-4 mb-5 flex items-center gap-4">
              <BarChart2 className="w-5 h-5 text-gray-500" />
              <div>
                <p className="text-sm font-semibold text-gray-900">Average Personalization Coverage: <span className={summary.averagePersonalizationPct >= 90 ? 'text-green-700' : summary.averagePersonalizationPct >= 60 ? 'text-amber-600' : 'text-red-600'}>{summary.averagePersonalizationPct}%</span></p>
                <p className="text-xs text-gray-500">Target: 100% evidence-backed candidate-specific questions</p>
              </div>
              {summary.runAt && (
                <p className="ml-auto text-xs text-gray-400 flex items-center gap-1">
                  <Clock className="w-3 h-3" />Last run {new Date(summary.runAt).toLocaleString()}
                </p>
              )}
            </div>

            {/* Filter */}
            <div className="flex items-center gap-2 mb-4">
              {(['ALL', 'PASS', 'WARN', 'FAIL'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${filter === f ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                >
                  {f} {f !== 'ALL' && `(${results.filter(r => r.qaStatus === f).length})`}
                </button>
              ))}
            </div>

            {/* Results */}
            <div className="space-y-3">
              {filtered.map(result => (
                <CandidateQADetail key={result.candidateId} result={result} />
              ))}
              {filtered.length === 0 && (
                <div className="bg-white border border-gray-200 rounded-2xl p-8 text-center">
                  <Search className="w-8 h-8 text-gray-300 mx-auto mb-3" />
                  <p className="text-sm text-gray-500">No results for this filter</p>
                </div>
              )}
            </div>

            {/* Legend */}
            <div className="mt-5 bg-blue-50 border border-blue-200 rounded-2xl p-4">
              <div className="flex items-start gap-3">
                <Info className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
                <div className="text-xs text-blue-800 space-y-1">
                  <p><span className="font-bold">PASS:</span> Resume parsed, 5+ specific questions, all evidence-backed, no suspicious cloning, core questions retained</p>
                  <p><span className="font-bold">WARN:</span> Too few specific questions, high similarity, limited resume evidence, or one question lacks strong evidence</p>
                  <p><span className="font-bold">FAIL:</span> All scripts effectively identical, name substitution only, no resume basis, or cross-candidate context leakage detected</p>
                  <p><span className="font-bold">Core questions</span> are expected to overlap across candidates — only candidate-specific questions are compared for uniqueness</p>
                </div>
              </div>
            </div>
          </>
        )}

        {/* Empty state */}
        {!loading && !loadingExisting && results.length === 0 && !error && (
          <div className="bg-white border border-gray-200 rounded-2xl p-12 text-center">
            <Zap className="w-10 h-10 text-gray-300 mx-auto mb-4" />
            <h3 className="text-base font-semibold text-gray-700 mb-1">No QA results yet</h3>
            <p className="text-sm text-gray-400 mb-5">Run the personalization test to verify all 8 candidate scripts are genuinely distinct.</p>
            <button
              onClick={runBatchQA}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gray-900 text-white text-sm font-semibold hover:bg-gray-800 transition-colors"
            >
              <Play className="w-4 h-4" />Run Candidate Personalization Test
            </button>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
