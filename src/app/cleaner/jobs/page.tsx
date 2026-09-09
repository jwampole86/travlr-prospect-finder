'use client';

import React, { useState, useRef } from 'react';
import { MapPin, Clock, CheckCircle, Camera, ChevronRight, ArrowLeft, Home, AlertCircle, X, FileText, Play, Flag, Star } from 'lucide-react';

type JobStatus = 'assigned' | 'checked-in' | 'in-progress' | 'checked-out' | 'completed';

interface PhotoItem {
  id: string;
  url: string;
  area: string;
  timestamp: string;
}

interface CleaningJob {
  id: string;
  property: string;
  address: string;
  date: string;
  timeWindow: string;
  type: string;
  status: JobStatus;
  specialInstructions?: string;
  requiredAreas: string[];
}

const MOCK_JOBS: CleaningJob[] = [
  {
    id: 'job-1',
    property: '1842 Larimer St',
    address: '1842 Larimer St, Denver, CO 80202',
    date: 'Today',
    timeWindow: '10:00 AM – 12:00 PM',
    type: 'Turnover',
    status: 'assigned',
    specialInstructions: 'Guest checks in at 3 PM. Pay extra attention to master bathroom. Leave fresh towels on bed.',
    requiredAreas: ['Living Room', 'Master Bedroom', 'Master Bathroom', 'Kitchen', 'Guest Bathroom'],
  },
  {
    id: 'job-2',
    property: '3301 Zuni St',
    address: '3301 Zuni St, Denver, CO 80211',
    date: 'Tomorrow',
    timeWindow: '9:00 AM – 11:00 AM',
    type: 'Deep Clean',
    status: 'assigned',
    requiredAreas: ['Living Room', 'Kitchen', 'Bedroom 1', 'Bedroom 2', 'Bathroom'],
  },
];

const STATUS_CONFIG: Record<JobStatus, { label: string; color: string; dot: string }> = {
  assigned: { label: 'Assigned', color: 'bg-blue-50 text-blue-700 border border-blue-200', dot: 'bg-blue-500' },
  'checked-in': { label: 'Checked In', color: 'bg-warning-bg text-warning border border-warning-border', dot: 'bg-warning' },
  'in-progress': { label: 'In Progress', color: 'bg-orange-50 text-orange-700 border border-orange-200', dot: 'bg-orange-500' },
  'checked-out': { label: 'Checked Out', color: 'bg-purple-50 text-purple-700 border border-purple-200', dot: 'bg-purple-500' },
  completed: { label: 'Completed', color: 'bg-success-bg text-success border border-success-border', dot: 'bg-success' },
};

export default function CleanerJobsPage() {
  const [selectedJob, setSelectedJob] = useState<CleaningJob | null>(null);
  const [jobStatuses, setJobStatuses] = useState<Record<string, JobStatus>>({
    'job-1': 'assigned',
    'job-2': 'assigned',
  });
  const [checkInTime, setCheckInTime] = useState<Record<string, string>>({});
  const [checkOutTime, setCheckOutTime] = useState<Record<string, string>>({});
  const [beforePhotos, setBeforePhotos] = useState<Record<string, PhotoItem[]>>({});
  const [afterPhotos, setAfterPhotos] = useState<Record<string, PhotoItem[]>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [activePhotoArea, setActivePhotoArea] = useState<string | null>(null);
  const [photoMode, setPhotoMode] = useState<'before' | 'after'>('before');
  const fileInputRef = useRef<HTMLInputElement>(null);

  function getNow() {
    const now = new Date();
    return now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  }

  function handleCheckIn(jobId: string) {
    const time = getNow();
    setCheckInTime(prev => ({ ...prev, [jobId]: time }));
    setJobStatuses(prev => ({ ...prev, [jobId]: 'checked-in' }));
  }

  function handleMarkInProgress(jobId: string) {
    setJobStatuses(prev => ({ ...prev, [jobId]: 'in-progress' }));
  }

  function handleCheckOut(jobId: string) {
    const time = getNow();
    setCheckOutTime(prev => ({ ...prev, [jobId]: time }));
    setJobStatuses(prev => ({ ...prev, [jobId]: 'checked-out' }));
  }

  function handleCompleteJob(jobId: string) {
    setJobStatuses(prev => ({ ...prev, [jobId]: 'completed' }));
    setSelectedJob(null);
  }

  function openPhotoCapture(area: string, mode: 'before' | 'after') {
    setActivePhotoArea(area);
    setPhotoMode(mode);
    fileInputRef.current?.click();
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>, jobId: string) {
    const file = e.target.files?.[0];
    if (!file || !activePhotoArea) return;
    const url = URL.createObjectURL(file);
    const photo: PhotoItem = {
      id: `${Date.now()}`,
      url,
      area: activePhotoArea,
      timestamp: getNow(),
    };
    if (photoMode === 'before') {
      setBeforePhotos(prev => ({ ...prev, [jobId]: [...(prev[jobId] || []), photo] }));
    } else {
      setAfterPhotos(prev => ({ ...prev, [jobId]: [...(prev[jobId] || []), photo] }));
    }
    setActivePhotoArea(null);
    e.target.value = '';
  }

  function removePhoto(jobId: string, photoId: string, mode: 'before' | 'after') {
    if (mode === 'before') {
      setBeforePhotos(prev => ({ ...prev, [jobId]: (prev[jobId] || []).filter(p => p.id !== photoId) }));
    } else {
      setAfterPhotos(prev => ({ ...prev, [jobId]: (prev[jobId] || []).filter(p => p.id !== photoId) }));
    }
  }

  // Job list view
  if (!selectedJob) {
    return (
      <div className="min-h-screen bg-background max-w-lg mx-auto">
        {/* Header */}
        <div className="bg-card border-b border-border px-4 py-5 sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
              <Home size={18} className="text-primary" />
            </div>
            <div>
              <h1 className="text-base font-bold text-foreground">My Jobs</h1>
              <p className="text-xs text-muted-foreground">{MOCK_JOBS.length} assigned today</p>
            </div>
          </div>
        </div>

        <div className="p-4 space-y-3">
          {MOCK_JOBS.map(job => {
            const status = jobStatuses[job.id] || job.status;
            const cfg = STATUS_CONFIG[status];
            return (
              <button
                key={job.id}
                onClick={() => setSelectedJob({ ...job, status })}
                className="w-full bg-card border border-border rounded-2xl p-4 text-left hover:border-primary/40 hover:shadow-sm transition-all active:scale-[0.99]"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0 pr-3">
                    <p className="text-base font-bold text-foreground truncate">{job.property}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">{job.address}</p>
                  </div>
                  <span className={`shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full ${cfg.color}`}>
                    {cfg.label}
                  </span>
                </div>
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><Clock size={11} />{job.timeWindow}</span>
                  <span className="flex items-center gap-1"><Star size={11} />{job.type}</span>
                </div>
                {checkInTime[job.id] && (
                  <div className="mt-2 text-xs text-success font-medium">✓ Checked in at {checkInTime[job.id]}</div>
                )}
                <div className="flex items-center justify-end mt-3">
                  <ChevronRight size={16} className="text-muted-foreground" />
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // Job detail / flow view
  const job = selectedJob;
  const status = jobStatuses[job.id] || job.status;
  const cfg = STATUS_CONFIG[status];
  const jobBeforePhotos = beforePhotos[job.id] || [];
  const jobAfterPhotos = afterPhotos[job.id] || [];
  const coveredBeforeAreas = new Set(jobBeforePhotos.map(p => p.area));
  const coveredAfterAreas = new Set(jobAfterPhotos.map(p => p.area));
  const allBeforeDone = job.requiredAreas.every(a => coveredBeforeAreas.has(a));
  const allAfterDone = job.requiredAreas.every(a => coveredAfterAreas.has(a));

  const canCheckOut = status === 'in-progress' && allBeforeDone;
  const canComplete = status === 'checked-out' && allAfterDone;

  return (
    <div className="min-h-screen bg-background max-w-lg mx-auto pb-32">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={e => handleFileChange(e, job.id)}
      />

      {/* Header */}
      <div className="bg-card border-b border-border px-4 py-4 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setSelectedJob(null)}
            className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center"
          >
            <ArrowLeft size={16} className="text-foreground" />
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-foreground truncate">{job.property}</p>
            <p className="text-xs text-muted-foreground">{job.timeWindow} · {job.type}</p>
          </div>
          <span className={`shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full ${cfg.color}`}>
            {cfg.label}
          </span>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Address card */}
        <div className="bg-card border border-border rounded-2xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <MapPin size={18} className="text-primary" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">{job.address}</p>
            <p className="text-xs text-muted-foreground">{job.date} · {job.timeWindow}</p>
          </div>
        </div>

        {/* Special instructions */}
        {job.specialInstructions && (
          <div className="bg-warning-bg border border-warning-border rounded-2xl p-4 flex items-start gap-3">
            <AlertCircle size={16} className="text-warning mt-0.5 shrink-0" />
            <div>
              <p className="text-xs font-semibold text-warning mb-1">Special Instructions</p>
              <p className="text-sm text-foreground">{job.specialInstructions}</p>
            </div>
          </div>
        )}

        {/* ── STEP 1: CHECK IN ── */}
        <StepCard
          step={1}
          title="Check In"
          done={status !== 'assigned'}
          active={status === 'assigned'}
        >
          {status === 'assigned' ? (
            <button
              onClick={() => handleCheckIn(job.id)}
              className="w-full py-4 bg-primary text-white rounded-2xl text-base font-bold flex items-center justify-center gap-3 active:scale-[0.98] transition-transform"
            >
              <Clock size={20} />
              Tap to Check In
            </button>
          ) : (
            <div className="flex items-center gap-2 text-success text-sm font-medium">
              <CheckCircle size={16} />
              Checked in at {checkInTime[job.id]}
            </div>
          )}
        </StepCard>

        {/* ── STEP 2: BEFORE PHOTOS ── */}
        {status !== 'assigned' && (
          <StepCard
            step={2}
            title="Before Photos"
            subtitle={`${coveredBeforeAreas.size} / ${job.requiredAreas.length} areas covered`}
            done={allBeforeDone}
            active={!allBeforeDone && (status === 'checked-in' || status === 'in-progress')}
          >
            <div className="space-y-2">
              {job.requiredAreas.map(area => {
                const areaPhotos = jobBeforePhotos.filter(p => p.area === area);
                const covered = coveredBeforeAreas.has(area);
                return (
                  <div key={area} className={`flex items-center justify-between p-3 rounded-xl border ${
                    covered ? 'bg-success-bg border-success-border' : 'bg-muted/40 border-border'
                  }`}>
                    <div className="flex items-center gap-2">
                      {covered
                        ? <CheckCircle size={15} className="text-success" />
                        : <Camera size={15} className="text-muted-foreground" />
                      }
                      <span className="text-sm font-medium text-foreground">{area}</span>
                      {covered && <span className="text-xs text-muted-foreground">({areaPhotos.length} photo{areaPhotos.length !== 1 ? 's' : ''})</span>}
                    </div>
                    <button
                      onClick={() => openPhotoCapture(area, 'before')}
                      className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-all ${
                        covered
                          ? 'bg-success/10 text-success' :'bg-primary text-white active:scale-95'
                      }`}
                    >
                      {covered ? '+ Add' : 'Take Photo'}
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Photo thumbnails */}
            {jobBeforePhotos.length > 0 && (
              <div className="flex gap-2 flex-wrap mt-3">
                {jobBeforePhotos.map(photo => (
                  <div key={photo.id} className="relative">
                    <img src={photo.url} alt={`Before - ${photo.area}`} className="w-16 h-16 object-cover rounded-xl border border-border" />
                    <button
                      onClick={() => removePhoto(job.id, photo.id, 'before')}
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-danger rounded-full flex items-center justify-center"
                    >
                      <X size={10} className="text-white" />
                    </button>
                    <p className="text-[9px] text-muted-foreground text-center mt-0.5 max-w-[64px] truncate">{photo.area}</p>
                  </div>
                ))}
              </div>
            )}
          </StepCard>
        )}

        {/* ── STEP 3: MARK IN PROGRESS ── */}
        {(status === 'checked-in') && allBeforeDone && (
          <StepCard step={3} title="Start Cleaning" active done={false}>
            <button
              onClick={() => handleMarkInProgress(job.id)}
              className="w-full py-4 bg-orange-500 text-white rounded-2xl text-base font-bold flex items-center justify-center gap-3 active:scale-[0.98] transition-transform"
            >
              <Play size={20} />
              Mark In Progress
            </button>
          </StepCard>
        )}

        {status === 'in-progress' && (
          <div className="bg-orange-50 border border-orange-200 rounded-2xl p-4 flex items-center gap-3">
            <div className="w-2.5 h-2.5 rounded-full bg-orange-500 animate-pulse shrink-0" />
            <p className="text-sm font-semibold text-orange-700">Cleaning in progress…</p>
          </div>
        )}

        {/* ── STEP 4: CHECK OUT ── */}
        {(status === 'in-progress' || status === 'checked-out') && (
          <StepCard
            step={4}
            title="Check Out"
            done={status === 'checked-out' || status === 'completed'}
            active={status === 'in-progress'}
          >
            {status === 'in-progress' ? (
              <button
                onClick={() => handleCheckOut(job.id)}
                disabled={!canCheckOut}
                className={`w-full py-4 rounded-2xl text-base font-bold flex items-center justify-center gap-3 transition-all ${
                  canCheckOut
                    ? 'bg-primary text-white active:scale-[0.98]'
                    : 'bg-muted text-muted-foreground cursor-not-allowed'
                }`}
              >
                <Flag size={20} />
                {canCheckOut ? 'Tap to Check Out' : 'Complete Before Photos First'}
              </button>
            ) : (
              <div className="flex items-center gap-2 text-success text-sm font-medium">
                <CheckCircle size={16} />
                Checked out at {checkOutTime[job.id]}
              </div>
            )}
          </StepCard>
        )}

        {/* ── STEP 5: AFTER PHOTOS ── */}
        {(status === 'checked-out' || status === 'completed') && (
          <StepCard
            step={5}
            title="After Photos"
            subtitle={`${coveredAfterAreas.size} / ${job.requiredAreas.length} areas covered`}
            done={allAfterDone}
            active={!allAfterDone}
          >
            <div className="space-y-2">
              {job.requiredAreas.map(area => {
                const areaPhotos = jobAfterPhotos.filter(p => p.area === area);
                const covered = coveredAfterAreas.has(area);
                return (
                  <div key={area} className={`flex items-center justify-between p-3 rounded-xl border ${
                    covered ? 'bg-success-bg border-success-border' : 'bg-muted/40 border-border'
                  }`}>
                    <div className="flex items-center gap-2">
                      {covered
                        ? <CheckCircle size={15} className="text-success" />
                        : <Camera size={15} className="text-muted-foreground" />
                      }
                      <span className="text-sm font-medium text-foreground">{area}</span>
                      {covered && <span className="text-xs text-muted-foreground">({areaPhotos.length} photo{areaPhotos.length !== 1 ? 's' : ''})</span>}
                    </div>
                    <button
                      onClick={() => openPhotoCapture(area, 'after')}
                      className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-all ${
                        covered
                          ? 'bg-success/10 text-success' :'bg-primary text-white active:scale-95'
                      }`}
                    >
                      {covered ? '+ Add' : 'Take Photo'}
                    </button>
                  </div>
                );
              })}
            </div>

            {jobAfterPhotos.length > 0 && (
              <div className="flex gap-2 flex-wrap mt-3">
                {jobAfterPhotos.map(photo => (
                  <div key={photo.id} className="relative">
                    <img src={photo.url} alt={`After - ${photo.area}`} className="w-16 h-16 object-cover rounded-xl border border-border" />
                    <button
                      onClick={() => removePhoto(job.id, photo.id, 'after')}
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-danger rounded-full flex items-center justify-center"
                    >
                      <X size={10} className="text-white" />
                    </button>
                    <p className="text-[9px] text-muted-foreground text-center mt-0.5 max-w-[64px] truncate">{photo.area}</p>
                  </div>
                ))}
              </div>
            )}
          </StepCard>
        )}

        {/* ── STEP 6: NOTES + COMPLETE ── */}
        {status === 'checked-out' && (
          <StepCard step={6} title="Notes & Completion" active done={false}>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-foreground mb-1.5 flex items-center gap-1.5">
                  <FileText size={12} />
                  Notes (optional)
                </label>
                <textarea
                  value={notes[job.id] || ''}
                  onChange={e => setNotes(prev => ({ ...prev, [job.id]: e.target.value }))}
                  placeholder="Any issues found, items needing attention, or notes for the team…"
                  rows={3}
                  className="w-full px-3 py-2.5 text-sm bg-background border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all resize-none"
                />
              </div>

              {!allAfterDone && (
                <div className="flex items-center gap-2 p-3 bg-warning-bg border border-warning-border rounded-xl">
                  <AlertCircle size={14} className="text-warning shrink-0" />
                  <p className="text-xs text-warning font-medium">Complete all after photos before finishing</p>
                </div>
              )}

              <button
                onClick={() => handleCompleteJob(job.id)}
                disabled={!canComplete}
                className={`w-full py-5 rounded-2xl text-lg font-bold flex items-center justify-center gap-3 transition-all ${
                  canComplete
                    ? 'bg-success text-white active:scale-[0.98] shadow-lg shadow-success/20'
                    : 'bg-muted text-muted-foreground cursor-not-allowed'
                }`}
              >
                <CheckCircle size={24} />
                Complete Job
              </button>
            </div>
          </StepCard>
        )}

        {/* Completed state */}
        {status === 'completed' && (
          <div className="bg-success-bg border border-success-border rounded-2xl p-6 text-center">
            <CheckCircle size={40} className="text-success mx-auto mb-3" />
            <p className="text-lg font-bold text-foreground">Job Complete!</p>
            <p className="text-sm text-muted-foreground mt-1">
              Checked in {checkInTime[job.id]} · Checked out {checkOutTime[job.id]}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {jobBeforePhotos.length} before photos · {jobAfterPhotos.length} after photos submitted
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── StepCard ── */
interface StepCardProps {
  step: number;
  title: string;
  subtitle?: string;
  done: boolean;
  active: boolean;
  children?: React.ReactNode;
}

function StepCard({ step, title, subtitle, done, active, children }: StepCardProps) {
  return (
    <div className={`bg-card border-2 rounded-2xl overflow-hidden transition-all ${
      done ? 'border-success/30' : active ? 'border-primary/40' : 'border-border'
    }`}>
      <div className={`px-4 py-3 flex items-center gap-3 ${
        done ? 'bg-success-bg' : active ? 'bg-primary/5' : 'bg-muted/30'
      }`}>
        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
          done ? 'bg-success text-white' : active ? 'bg-primary text-white' : 'bg-muted text-muted-foreground'
        }`}>
          {done ? <CheckCircle size={14} /> : step}
        </div>
        <div>
          <p className={`text-sm font-bold ${done ? 'text-success' : active ? 'text-foreground' : 'text-muted-foreground'}`}>
            {title}
          </p>
          {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
        </div>
      </div>
      {children && (
        <div className="px-4 py-4">
          {children}
        </div>
      )}
    </div>
  );
}
