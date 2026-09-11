'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Mic, Play, Pause, Square, Download, RefreshCw, Clock, FileText, Loader2, AlertCircle, Check, X, Calendar, User, Volume2, Trash2,  } from 'lucide-react';
import { toast } from 'sonner';
import Link from 'next/link';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AudioRecording {
  id: string;
  session_id: string | null;
  candidate_profile_id: string | null;
  storage_path: string;
  file_name: string;
  file_size_bytes: number;
  duration_seconds: number;
  mime_type: string;
  transcript: TranscriptSegment[];
  transcript_text: string;
  transcript_status: 'pending' | 'processing' | 'completed' | 'failed';
  timestamp_markers: TimestampMarker[];
  created_at: string;
}

interface TranscriptSegment {
  id: string;
  speaker: string;
  text: string;
  timestamp: string;
  start_seconds?: number;
  end_seconds?: number;
}

interface TimestampMarker {
  id: string;
  time_seconds: number;
  label: string;
  note: string;
  created_at: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDuration(secs: number) {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ─── Live Recorder Component ──────────────────────────────────────────────────

function LiveRecorder({ onRecordingComplete }: { onRecordingComplete: (blob: Blob, duration: number) => void }) {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [audioLevel, setAudioLevel] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);

  const stopVisualizer = () => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    setAudioLevel(0);
  };

  const startVisualizer = (stream: MediaStream) => {
    const ctx = new AudioContext();
    const src = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    src.connect(analyser);
    analyserRef.current = analyser;
    const data = new Uint8Array(analyser.frequencyBinCount);
    const tick = () => {
      analyser.getByteFrequencyData(data);
      const avg = data.reduce((a, b) => a + b, 0) / data.length;
      setAudioLevel(Math.min(100, avg * 2));
      animFrameRef.current = requestAnimationFrame(tick);
    };
    tick();
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus' : MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/ogg';
      const mr = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mr;
      chunksRef.current = [];
      mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        const duration = Math.floor((Date.now() - startTimeRef.current) / 1000);
        onRecordingComplete(blob, duration);
        stream.getTracks().forEach(t => t.stop());
        stopVisualizer();
      };
      mr.start(1000);
      startTimeRef.current = Date.now();
      setIsRecording(true);
      setIsPaused(false);
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000);
      startVisualizer(stream);
    } catch (err: any) {
      toast.error('Microphone access denied. Please allow mic access.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setIsPaused(false);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  };

  const togglePause = () => {
    if (!mediaRecorderRef.current) return;
    if (isPaused) {
      mediaRecorderRef.current.resume();
      timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000);
      setIsPaused(false);
    } else {
      mediaRecorderRef.current.pause();
      if (timerRef.current) clearInterval(timerRef.current);
      setIsPaused(true);
    }
  };

  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current);
    stopVisualizer();
  }, []);

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5">
      <div className="flex items-center gap-3 mb-4">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${isRecording ? 'bg-red-100' : 'bg-gray-100'}`}>
          <Mic className={`w-5 h-5 ${isRecording ? 'text-red-600' : 'text-gray-600 dark:text-gray-500'}`} />
        </div>
        <div>
          <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">Live Audio Recorder</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400">Record Zoom interview audio via browser</p>
        </div>
        {isRecording && (
          <div className="ml-auto flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            <span className="text-sm font-mono font-bold text-red-600">{formatDuration(elapsed)}</span>
          </div>
        )}
      </div>

      {/* Audio level visualizer */}
      {isRecording && !isPaused && (
        <div className="mb-4 h-2 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-red-500 rounded-full transition-all duration-75"
            style={{ width: `${audioLevel}%` }}
          />
        </div>
      )}

      <div className="flex items-center gap-3">
        {!isRecording ? (
          <button
            onClick={startRecording}
            className="flex items-center gap-2 px-4 py-2.5 bg-red-600 text-white rounded-xl text-sm font-semibold hover:bg-red-700 transition-colors"
          >
            <Mic className="w-4 h-4" /> Start Recording
          </button>
        ) : (
          <>
            <button
              onClick={togglePause}
              className="flex items-center gap-2 px-4 py-2.5 border border-gray-200 text-gray-700 rounded-xl text-sm font-semibold hover:bg-gray-50 transition-colors"
            >
              {isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
              {isPaused ? 'Resume' : 'Pause'}
            </button>
            <button
              onClick={stopRecording}
              className="flex items-center gap-2 px-4 py-2.5 bg-gray-900 text-white rounded-xl text-sm font-semibold hover:bg-gray-800 transition-colors"
            >
              <Square className="w-4 h-4" /> Stop & Save
            </button>
          </>
        )}
        <p className="text-xs text-gray-400 dark:text-gray-500 ml-2">
          {isRecording ? (isPaused ? 'Recording paused' : 'Recording in progress...') : 'Click to start recording your Zoom interview audio'}
        </p>
      </div>
    </div>
  );
}

// ─── Recording Card ───────────────────────────────────────────────────────────

function RecordingCard({
  recording,
  onDelete,
  onTranscribe,
  onAddMarker,
}: {
  recording: AudioRecording;
  onDelete: () => void;
  onTranscribe: () => void;
  onAddMarker: (timeSeconds: number, label: string) => void;
}) {
  const supabase = createClient();
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(recording.duration_seconds || 0);
  const [loadingUrl, setLoadingUrl] = useState(false);
  const [activeTab, setActiveTab] = useState<'transcript' | 'markers'>('transcript');
  const [markerLabel, setMarkerLabel] = useState('');
  const [showMarkerInput, setShowMarkerInput] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const loadAudio = async () => {
    if (audioUrl) return;
    setLoadingUrl(true);
    const { data } = await supabase.storage
      .from('interview-recordings')
      .createSignedUrl(recording.storage_path, 3600);
    if (data?.signedUrl) setAudioUrl(data.signedUrl);
    setLoadingUrl(false);
  };

  const togglePlay = async () => {
    await loadAudio();
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play();
      setIsPlaying(true);
    }
  };

  const seekTo = (seconds: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = seconds;
      setCurrentTime(seconds);
    }
  };

  const handleAddMarker = () => {
    if (!markerLabel.trim()) return;
    onAddMarker(currentTime, markerLabel.trim());
    setMarkerLabel('');
    setShowMarkerInput(false);
  };

  const downloadRecording = async () => {
    await loadAudio();
    if (!audioUrl) return;
    const a = document.createElement('a');
    a.href = audioUrl;
    a.download = recording.file_name;
    a.click();
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-gray-100 dark:border-gray-700">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
              <Volume2 className="w-4 h-4 text-gray-600 dark:text-gray-400" />
            </div>
            <div>
              <p className="text-sm font-bold text-gray-900 dark:text-gray-100 truncate max-w-[200px]">{recording.file_name}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {formatDuration(recording.duration_seconds)} · {formatFileSize(recording.file_size_bytes)} · {new Date(recording.created_at).toLocaleDateString()}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={downloadRecording} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-gray-500 dark:text-gray-400" title="Download">
              <Download className="w-3.5 h-3.5" />
            </button>
            <button onClick={onDelete} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors text-gray-400 dark:text-gray-500 hover:text-red-500" title="Delete">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Audio Player */}
        <div className="flex items-center gap-3">
          <button
            onClick={togglePlay}
            disabled={loadingUrl}
            className="w-9 h-9 rounded-xl bg-gray-900 text-white flex items-center justify-center hover:bg-gray-800 transition-colors disabled:opacity-50"
          >
            {loadingUrl ? <Loader2 className="w-4 h-4 animate-spin" /> : isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          </button>
          <div className="flex-1">
            <input
              type="range"
              min={0}
              max={duration || 1}
              value={currentTime}
              onChange={e => seekTo(Number(e.target.value))}
              className="w-full h-1.5 accent-gray-900"
            />
            <div className="flex justify-between text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">
              <span>{formatDuration(currentTime)}</span>
              <span>{formatDuration(duration)}</span>
            </div>
          </div>
          <button
            onClick={() => setShowMarkerInput(v => !v)}
            className="px-2.5 py-1.5 border border-gray-200 dark:border-gray-700 rounded-lg text-xs font-semibold text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            title="Add timestamp marker"
          >
            + Marker
          </button>
        </div>

        {showMarkerInput && (
          <div className="flex items-center gap-2 mt-2">
            <span className="text-xs text-gray-500 dark:text-gray-400 font-mono">{formatDuration(currentTime)}</span>
            <input
              type="text"
              value={markerLabel}
              onChange={e => setMarkerLabel(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAddMarker()}
              placeholder="Marker label..."
              className="flex-1 px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 text-xs focus:outline-none focus:ring-1 focus:ring-gray-900 dark:focus:ring-gray-400"
              autoFocus
            />
            <button onClick={handleAddMarker} className="p-1.5 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors">
              <Check className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => setShowMarkerInput(false)} className="p-1.5 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
              <X className="w-3.5 h-3.5 text-gray-500 dark:text-gray-400" />
            </button>
          </div>
        )}

        {audioUrl && (
          <audio
            ref={audioRef}
            src={audioUrl}
            onTimeUpdate={() => setCurrentTime(audioRef.current?.currentTime || 0)}
            onDurationChange={() => setDuration(audioRef.current?.duration || 0)}
            onEnded={() => setIsPlaying(false)}
            className="hidden"
          />
        )}
      </div>

      {/* Transcript / Markers Tabs */}
      <div className="border-b border-gray-100 dark:border-gray-700">
        <div className="flex">
          {(['transcript', 'markers'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-2.5 text-xs font-semibold capitalize transition-colors ${activeTab === tab ? 'text-gray-900 dark:text-gray-100 border-b-2 border-gray-900 dark:border-gray-400' : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-400'}`}
            >
              {tab === 'transcript' ? `Transcript ${recording.transcript_status === 'completed' ? `(${recording.transcript.length})` : ''}` : `Markers (${recording.timestamp_markers.length})`}
            </button>
          ))}
        </div>
      </div>

      <div className="p-4 max-h-64 overflow-y-auto">
        {activeTab === 'transcript' && (
          <>
            {recording.transcript_status === 'pending' && (
              <div className="text-center py-6">
                <FileText className="w-8 h-8 text-gray-200 dark:text-gray-700 mx-auto mb-2" />
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">No transcript yet</p>
                <button
                  onClick={onTranscribe}
                  className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-xl text-xs font-semibold hover:bg-gray-800 transition-colors mx-auto"
                >
                  <FileText className="w-3.5 h-3.5" /> Generate Transcript
                </button>
              </div>
            )}
            {recording.transcript_status === 'processing' && (
              <div className="flex items-center justify-center gap-2 py-6 text-gray-500 dark:text-gray-400">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm">Transcribing with Whisper...</span>
              </div>
            )}
            {recording.transcript_status === 'failed' && (
              <div className="flex items-center gap-2 py-4 text-red-600">
                <AlertCircle className="w-4 h-4" />
                <span className="text-sm">Transcription failed.</span>
                <button onClick={onTranscribe} className="text-xs underline">Retry</button>
              </div>
            )}
            {recording.transcript_status === 'completed' && recording.transcript.length > 0 && (
              <div className="space-y-2">
                {recording.transcript.map((seg, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <button
                      onClick={() => seekTo(seg.start_seconds || 0)}
                      className="text-[10px] font-mono text-blue-500 hover:text-blue-700 flex-shrink-0 mt-0.5 hover:underline"
                    >
                      {seg.timestamp}
                    </button>
                    <p className="text-xs text-gray-700 dark:text-gray-300 leading-relaxed">{seg.text}</p>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {activeTab === 'markers' && (
          <>
            {recording.timestamp_markers.length === 0 ? (
              <div className="text-center py-6">
                <Clock className="w-8 h-8 text-gray-200 dark:text-gray-700 mx-auto mb-2" />
                <p className="text-sm text-gray-500 dark:text-gray-400">No markers yet</p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Click "+ Marker" while playing to add timestamp notes</p>
              </div>
            ) : (
              <div className="space-y-2">
                {recording.timestamp_markers.map((m, i) => (
                  <div key={i} className="flex items-center gap-2 p-2 bg-gray-50 dark:bg-gray-700 rounded-lg">
                    <button
                      onClick={() => seekTo(m.time_seconds)}
                      className="text-[10px] font-mono text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 flex-shrink-0 hover:underline"
                    >
                      {formatDuration(m.time_seconds)}
                    </button>
                    <span className="text-xs font-semibold text-gray-700 dark:text-gray-200">{m.label}</span>
                    {m.note && <span className="text-xs text-gray-500 dark:text-gray-400 truncate">{m.note}</span>}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function InterviewRecordingsPage() {
  const { user } = useAuth();
  const supabase = createClient();
  const [recordings, setRecordings] = useState<AudioRecording[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  const fetchRecordings = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('interview_audio_recordings')
      .select('*')
      .order('created_at', { ascending: false });
    if (!error && data) setRecordings(data as AudioRecording[]);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchRecordings(); }, [fetchRecordings]);

  const handleRecordingComplete = async (blob: Blob, durationSeconds: number) => {
    setUploading(true);
    try {
      const fileName = `interview-${Date.now()}.webm`;
      const storagePath = `${user?.id || 'anon'}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('interview-recordings')
        .upload(storagePath, blob, { contentType: blob.type, upsert: false });

      if (uploadError) throw uploadError;

      const { data: row, error: insertError } = await supabase
        .from('interview_audio_recordings')
        .insert({
          storage_path: storagePath,
          file_name: fileName,
          file_size_bytes: blob.size,
          duration_seconds: durationSeconds,
          mime_type: blob.type,
          transcript: [],
          transcript_text: '',
          transcript_status: 'pending',
          timestamp_markers: [],
          created_by: user?.id,
        })
        .select('id')
        .single();

      if (insertError) throw insertError;
      toast.success('Recording saved to Supabase Storage!');
      fetchRecordings();
    } catch (err: any) {
      toast.error(err.message || 'Failed to save recording');
    } finally {
      setUploading(false);
    }
  };

  const handleTranscribe = async (recording: AudioRecording) => {
    // Mark as processing
    await supabase.from('interview_audio_recordings')
      .update({ transcript_status: 'processing' })
      .eq('id', recording.id);
    setRecordings(prev => prev.map(r => r.id === recording.id ? { ...r, transcript_status: 'processing' } : r));

    try {
      // Get signed URL for the audio file
      const { data: urlData } = await supabase.storage
        .from('interview-recordings')
        .createSignedUrl(recording.storage_path, 300);

      if (!urlData?.signedUrl) throw new Error('Could not get audio URL');

      // Fetch the audio blob
      const audioRes = await fetch(urlData.signedUrl);
      const audioBlob = await audioRes.blob();
      const audioFile = new File([audioBlob], recording.file_name, { type: recording.mime_type });

      const formData = new FormData();
      formData.append('file', audioFile);
      formData.append('recording_id', recording.id);

      const res = await fetch('/api/interview/transcribe', { method: 'POST', body: formData });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'Transcription failed');

      toast.success('Transcript generated!');
      fetchRecordings();
    } catch (err: any) {
      await supabase.from('interview_audio_recordings')
        .update({ transcript_status: 'failed' })
        .eq('id', recording.id);
      toast.error(err.message || 'Transcription failed');
      fetchRecordings();
    }
  };

  const handleDelete = async (recording: AudioRecording) => {
    if (!confirm('Delete this recording?')) return;
    await supabase.storage.from('interview-recordings').remove([recording.storage_path]);
    await supabase.from('interview_audio_recordings').delete().eq('id', recording.id);
    toast.success('Recording deleted');
    fetchRecordings();
  };

  const handleAddMarker = async (recording: AudioRecording, timeSeconds: number, label: string) => {
    const newMarker: TimestampMarker = {
      id: `m-${Date.now()}`,
      time_seconds: timeSeconds,
      label,
      note: '',
      created_at: new Date().toISOString(),
    };
    const updatedMarkers = [...recording.timestamp_markers, newMarker];
    await supabase.from('interview_audio_recordings')
      .update({ timestamp_markers: updatedMarkers })
      .eq('id', recording.id);
    setRecordings(prev => prev.map(r => r.id === recording.id ? { ...r, timestamp_markers: updatedMarkers } : r));
    toast.success('Marker added');
  };

  return (
    <AppLayout>
      <div className="p-6 max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Interview Recordings</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Record, transcribe, and review interview audio with timestamp markers</p>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/interview-calendar" className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors">
              <Calendar className="w-4 h-4" /> Calendar
            </Link>
            <Link href="/candidate-profiles" className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors">
              <User className="w-4 h-4" /> Profiles
            </Link>
          </div>
        </div>

        {/* Live Recorder */}
        <div className="mb-6">
          {uploading ? (
            <div className="bg-white rounded-2xl border border-gray-200 p-5 flex items-center gap-3">
              <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
              <span className="text-sm text-gray-600">Uploading recording to Supabase Storage...</span>
            </div>
          ) : (
            <LiveRecorder onRecordingComplete={handleRecordingComplete} />
          )}
        </div>

        {/* Recordings List */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wide">Saved Recordings ({recordings.length})</h2>
            <button onClick={fetchRecordings} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-gray-500 dark:text-gray-400">
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="w-6 h-6 text-gray-400 dark:text-gray-500 animate-spin" />
            </div>
          ) : recordings.length === 0 ? (
            <div className="text-center py-12 bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700">
              <Mic className="w-12 h-12 text-gray-200 dark:text-gray-700 mx-auto mb-3" />
              <p className="text-gray-500 dark:text-gray-400 font-medium">No recordings yet</p>
              <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">Start recording your Zoom interview audio above</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {recordings.map(recording => (
                <RecordingCard
                  key={recording.id}
                  recording={recording}
                  onDelete={() => handleDelete(recording)}
                  onTranscribe={() => handleTranscribe(recording)}
                  onAddMarker={(time, label) => handleAddMarker(recording, time, label)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
