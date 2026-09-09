'use client';

import React, { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Headphones, Mic, Volume2, ChevronDown, AlertTriangle, WifiOff, CheckCircle, AlertCircle, Loader2, Phone, Shield, Info, ArrowRight, RefreshCw, Radio } from 'lucide-react';
import { toast } from 'sonner';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AudioDevice {
  deviceId: string;
  label: string;
  kind: MediaDeviceKind;
}

interface HeadsetState {
  inputDevices: AudioDevice[];
  outputDevices: AudioDevice[];
  selectedInputId: string;
  selectedOutputId: string;
  isTestingMic: boolean;
  micLevel: number;
  isTestingOutput: boolean;
  permissionGranted: boolean;
  permissionError: string;
  inputConnected: boolean;
  outputConnected: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isBluetoothDevice(label: string): boolean {
  return /bluetooth|bt|airpod|bose|sony|jabra|plantronics|poly|sennheiser/i.test(label);
}

// ─── Main Inner Component ─────────────────────────────────────────────────────

function HeadsetSetupInner() {
  const searchParams = useSearchParams();
  const router = useRouter();

  // Pass-through params from teleprompter setup
  const contactName = searchParams.get('contactName') || '';
  const address = searchParams.get('address') || '';
  const city = searchParams.get('city') || '';
  const state = searchParams.get('state') || 'CO';
  const phone = searchParams.get('phone') || '';
  const agentName = searchParams.get('agentName') || '';
  const scriptId = searchParams.get('scriptId') || 'initial_outreach';
  const leadId = searchParams.get('leadId') || '';

  const [consentChecked, setConsentChecked] = useState(false);
  const [micTested, setMicTested] = useState(false);
  const [speakerTested, setSpeakerTested] = useState(false);

  const [state_, setState_] = useState<HeadsetState>({
    inputDevices: [],
    outputDevices: [],
    selectedInputId: '',
    selectedOutputId: '',
    isTestingMic: false,
    micLevel: 0,
    isTestingOutput: false,
    permissionGranted: false,
    permissionError: '',
    inputConnected: false,
    outputConnected: false,
  });

  const streamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  const requestPermission = useCallback(async () => {
    setState_(s => ({ ...s, permissionError: '' }));
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 16000 },
      });
      streamRef.current = stream;
      const devices = await navigator.mediaDevices.enumerateDevices();
      const inputs = devices
        .filter(d => d.kind === 'audioinput')
        .map(d => ({ deviceId: d.deviceId, label: d.label || `Microphone ${d.deviceId.slice(0, 6)}`, kind: d.kind as MediaDeviceKind }));
      const outputs = devices
        .filter(d => d.kind === 'audiooutput')
        .map(d => ({ deviceId: d.deviceId, label: d.label || `Speaker ${d.deviceId.slice(0, 6)}`, kind: d.kind as MediaDeviceKind }));

      setState_(s => ({
        ...s,
        permissionGranted: true,
        inputDevices: inputs,
        outputDevices: outputs,
        selectedInputId: inputs[0]?.deviceId || '',
        selectedOutputId: outputs[0]?.deviceId || '',
        inputConnected: inputs.length > 0,
        outputConnected: outputs.length > 0,
      }));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setState_(s => ({
        ...s,
        permissionError: msg.includes('denied')
          ? 'Microphone access was denied. Please allow microphone access in your browser settings and try again.'
          : `Could not access microphone: ${msg}`,
      }));
    }
  }, []);

  useEffect(() => {
    requestPermission();
    return () => {
      streamRef.current?.getTracks().forEach(t => t.stop());
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      audioCtxRef.current?.close();
    };
  }, [requestPermission]);

  // Device change listener
  useEffect(() => {
    const handleDeviceChange = async () => {
      if (!state_.permissionGranted) return;
      const devices = await navigator.mediaDevices.enumerateDevices();
      const inputs = devices
        .filter(d => d.kind === 'audioinput')
        .map(d => ({ deviceId: d.deviceId, label: d.label || `Microphone ${d.deviceId.slice(0, 6)}`, kind: d.kind as MediaDeviceKind }));
      const outputs = devices
        .filter(d => d.kind === 'audiooutput')
        .map(d => ({ deviceId: d.deviceId, label: d.label || `Speaker ${d.deviceId.slice(0, 6)}`, kind: d.kind as MediaDeviceKind }));
      const inputStillConnected = inputs.some(d => d.deviceId === state_.selectedInputId);
      setState_(s => ({ ...s, inputDevices: inputs, outputDevices: outputs, inputConnected: inputStillConnected }));
      if (!inputStillConnected) toast.error('Headset disconnected — reconnect to continue');
    };
    navigator.mediaDevices.addEventListener('devicechange', handleDeviceChange);
    return () => navigator.mediaDevices.removeEventListener('devicechange', handleDeviceChange);
  }, [state_.permissionGranted, state_.selectedInputId]);

  const startMicTest = useCallback(async () => {
    if (!state_.selectedInputId) return;
    setState_(s => ({ ...s, isTestingMic: true, micLevel: 0 }));
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { deviceId: { exact: state_.selectedInputId }, echoCancellation: true, noiseSuppression: true },
      });
      streamRef.current?.getTracks().forEach(t => t.stop());
      streamRef.current = stream;
      const ctx = new AudioContext();
      audioCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;
      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteFrequencyData(data);
        const avg = data.reduce((a, b) => a + b, 0) / data.length;
        setState_(s => ({ ...s, micLevel: Math.min(100, avg * 2) }));
        animFrameRef.current = requestAnimationFrame(tick);
      };
      animFrameRef.current = requestAnimationFrame(tick);
      setTimeout(() => {
        if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
        setState_(s => ({ ...s, isTestingMic: false, micLevel: 0 }));
        setMicTested(true);
        toast.success('Microphone test complete');
      }, 5000);
    } catch {
      setState_(s => ({ ...s, isTestingMic: false }));
      toast.error('Could not access selected microphone');
    }
  }, [state_.selectedInputId]);

  const stopMicTest = useCallback(() => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    setState_(s => ({ ...s, isTestingMic: false, micLevel: 0 }));
    setMicTested(true);
  }, []);

  const playTestTone = useCallback(async () => {
    setState_(s => ({ ...s, isTestingOutput: true }));
    try {
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 440;
      gain.gain.value = 0.3;
      osc.start();
      osc.stop(ctx.currentTime + 0.8);
      osc.onended = () => {
        ctx.close();
        setState_(s => ({ ...s, isTestingOutput: false }));
        setSpeakerTested(true);
        toast.success('Speaker test complete — audio confirmed');
      };
    } catch {
      setState_(s => ({ ...s, isTestingOutput: false }));
    }
  }, []);

  const canProceed = state_.permissionGranted && state_.inputConnected && consentChecked;

  const handleReadyToCall = () => {
    if (!canProceed) {
      if (!state_.permissionGranted) { toast.error('Microphone access required'); return; }
      if (!state_.inputConnected) { toast.error('Please connect a microphone'); return; }
      if (!consentChecked) { toast.error('Please acknowledge the call recording consent'); return; }
    }

    // Save device preferences to localStorage
    if (typeof window !== 'undefined') {
      localStorage.setItem('travlr_audio_input', state_.selectedInputId);
      localStorage.setItem('travlr_audio_output', state_.selectedOutputId);
    }

    // Navigate to teleprompter with all params
    const params = new URLSearchParams();
    if (contactName) params.set('contactName', contactName);
    if (address) params.set('address', address);
    if (city) params.set('city', city);
    if (state) params.set('state', state);
    if (phone) params.set('phone', phone);
    if (agentName) params.set('agentName', agentName);
    if (scriptId) params.set('scriptId', scriptId);
    if (leadId) params.set('leadId', leadId);
    params.set('audioInputId', state_.selectedInputId);
    params.set('audioOutputId', state_.selectedOutputId);
    params.set('fromHeadsetSetup', '1');

    router.push(`/teleprompter?${params.toString()}`);
  };

  const selectedInputLabel = state_.inputDevices.find(d => d.deviceId === state_.selectedInputId)?.label || '';

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-10">

        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-gray-900 flex items-center justify-center">
              <Headphones className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Headset Setup</h1>
              <p className="text-sm text-gray-500">Configure your audio devices before starting the call session</p>
            </div>
          </div>

          {/* Progress steps */}
          <div className="flex items-center gap-2 mt-4">
            {[
              { label: 'Mic Access', done: state_.permissionGranted },
              { label: 'Device Selection', done: state_.permissionGranted && !!state_.selectedInputId },
              { label: 'Audio Test', done: micTested || speakerTested },
              { label: 'Consent', done: consentChecked },
            ].map((step, i) => (
              <React.Fragment key={step.label}>
                <div className="flex items-center gap-1.5">
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${step.done ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-500'}`}>
                    {step.done ? <CheckCircle className="w-3 h-3" /> : i + 1}
                  </div>
                  <span className={`text-xs font-medium ${step.done ? 'text-green-700' : 'text-gray-500'}`}>{step.label}</span>
                </div>
                {i < 3 && <div className="flex-1 h-px bg-gray-200" />}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Lead context banner */}
        {(contactName || address) && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 mb-6 flex items-center gap-3">
            <Phone className="w-4 h-4 text-blue-500 flex-shrink-0" />
            <div className="text-sm">
              <span className="font-semibold text-blue-800">Preparing call for: </span>
              <span className="text-blue-700">{contactName || 'Homeowner'}</span>
              {address && <span className="text-blue-600"> · {address}</span>}
              {phone && <span className="text-blue-600"> · {phone}</span>}
            </div>
          </div>
        )}

        {/* Permission request */}
        {!state_.permissionGranted && !state_.permissionError && (
          <div className="bg-white border border-gray-200 rounded-2xl p-8 mb-6 text-center">
            <div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center mx-auto mb-4">
              <Mic className="w-7 h-7 text-blue-500" />
            </div>
            <h2 className="text-lg font-bold text-gray-900 mb-2">Microphone Access Required</h2>
            <p className="text-sm text-gray-500 mb-6 max-w-sm mx-auto">
              TRAVLR needs microphone access to power live call transcription and AI suggestions during homeowner calls.
            </p>
            <button
              onClick={requestPermission}
              className="px-6 py-3 bg-gray-900 text-white rounded-xl text-sm font-semibold hover:bg-gray-800 transition-colors"
            >
              Allow Microphone Access
            </button>
          </div>
        )}

        {/* Permission error */}
        {state_.permissionError && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-5 mb-6">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-red-800 mb-1">Microphone Access Blocked</p>
                <p className="text-xs text-red-600 mb-3">{state_.permissionError}</p>
                <button onClick={requestPermission} className="flex items-center gap-1.5 text-xs font-semibold text-red-700 hover:text-red-800">
                  <RefreshCw className="w-3.5 h-3.5" /> Try Again
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Device configuration */}
        {state_.permissionGranted && (
          <div className="space-y-4">

            {/* Microphone selection */}
            <div className="bg-white border border-gray-200 rounded-2xl p-6">
              <div className="flex items-center gap-2 mb-4">
                <Mic className="w-4 h-4 text-gray-600" />
                <h3 className="text-sm font-bold text-gray-800">Microphone (Input)</h3>
                {state_.inputConnected && (
                  <span className="ml-auto flex items-center gap-1 text-xs text-green-600 font-medium">
                    <CheckCircle className="w-3.5 h-3.5" /> Connected
                  </span>
                )}
              </div>

              <div className="relative mb-3">
                <select
                  value={state_.selectedInputId}
                  onChange={e => setState_(s => ({ ...s, selectedInputId: e.target.value, inputConnected: true }))}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white appearance-none pr-8"
                >
                  {state_.inputDevices.map(d => (
                    <option key={d.deviceId} value={d.deviceId}>{d.label}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              </div>

              {selectedInputLabel && isBluetoothDevice(selectedInputLabel) && (
                <div className="flex items-start gap-2 mb-3 p-2.5 bg-amber-50 border border-amber-200 rounded-lg">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-500 mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-amber-700">Wired headsets are recommended. Bluetooth adds 100–300ms latency that may affect live suggestions.</p>
                </div>
              )}

              {!state_.inputConnected && (
                <div className="flex items-center gap-2 mb-3 p-2.5 bg-red-50 border border-red-200 rounded-lg">
                  <WifiOff className="w-3.5 h-3.5 text-red-500" />
                  <p className="text-xs text-red-600">Selected device not detected — reconnect or choose another</p>
                </div>
              )}

              {/* Mic level test */}
              <div className="bg-gray-50 rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-gray-600">Microphone Level Test</span>
                  <button
                    onClick={state_.isTestingMic ? stopMicTest : startMicTest}
                    className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${
                      state_.isTestingMic
                        ? 'bg-red-100 text-red-700 hover:bg-red-200' :'bg-gray-900 text-white hover:bg-gray-800'
                    }`}
                  >
                    {state_.isTestingMic ? 'Stop Test' : 'Test Mic'}
                  </button>
                </div>
                <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-75"
                    style={{
                      width: `${state_.micLevel}%`,
                      backgroundColor: state_.micLevel > 70 ? '#ef4444' : state_.micLevel > 30 ? '#22c55e' : '#d1d5db',
                    }}
                  />
                </div>
                {state_.isTestingMic && (
                  <p className="mt-2 text-xs text-gray-500 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                    Speak into your mic — you should see the bar move
                  </p>
                )}
                {micTested && !state_.isTestingMic && (
                  <p className="mt-2 text-xs text-green-600 flex items-center gap-1.5">
                    <CheckCircle className="w-3.5 h-3.5" /> Microphone test completed
                  </p>
                )}
              </div>
            </div>

            {/* Speaker selection */}
            <div className="bg-white border border-gray-200 rounded-2xl p-6">
              <div className="flex items-center gap-2 mb-4">
                <Volume2 className="w-4 h-4 text-gray-600" />
                <h3 className="text-sm font-bold text-gray-800">Speaker / Headset (Output)</h3>
              </div>

              <div className="relative mb-4">
                <select
                  value={state_.selectedOutputId}
                  onChange={e => setState_(s => ({ ...s, selectedOutputId: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white appearance-none pr-8"
                >
                  {state_.outputDevices.map(d => (
                    <option key={d.deviceId} value={d.deviceId}>{d.label}</option>
                  ))}
                  {state_.outputDevices.length === 0 && (
                    <option value="">Default system output</option>
                  )}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              </div>

              <div className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-gray-700">Test Speaker Output</p>
                  <p className="text-xs text-gray-500 mt-0.5">Play a tone to confirm audio routing</p>
                </div>
                <button
                  onClick={playTestTone}
                  disabled={state_.isTestingOutput}
                  className="flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-200 rounded-lg text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-60"
                >
                  {state_.isTestingOutput ? (
                    <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Playing…</>
                  ) : (
                    <><Volume2 className="w-3.5 h-3.5" /> Play Tone</>
                  )}
                </button>
              </div>
              {speakerTested && (
                <p className="mt-2 text-xs text-green-600 flex items-center gap-1.5 px-1">
                  <CheckCircle className="w-3.5 h-3.5" /> Speaker test completed
                </p>
              )}
            </div>

            {/* Call Recording Consent */}
            <div className="bg-white border border-gray-200 rounded-2xl p-6">
              <div className="flex items-center gap-2 mb-4">
                <Shield className="w-4 h-4 text-gray-600" />
                <h3 className="text-sm font-bold text-gray-800">Call Recording Consent</h3>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-amber-800 mb-1">Recording Disclosure Required</p>
                    <p className="text-xs text-amber-700 mb-3">
                      Before recording begins, you must read this disclosure to the homeowner at the start of the call:
                    </p>
                    <blockquote className="text-sm text-amber-900 italic border-l-4 border-amber-400 pl-3 leading-relaxed">
                      "Hi {contactName || '[Homeowner]'}, before we get started — this call may be recorded for quality and training purposes. Is that okay with you?"
                    </blockquote>
                  </div>
                </div>
              </div>

              <div className="bg-gray-50 rounded-xl p-4 mb-4 space-y-2">
                <div className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-gray-600">Call duration, outcome, and recording URL are captured per lead contact</p>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-gray-600">Transcripts stored securely, accessible only to you and admins</p>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-gray-600">Recording begins only after homeowner verbal confirmation</p>
                </div>
                <div className="flex items-start gap-2">
                  <Info className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-gray-600">All-party consent states (CA, WA, FL, MA, IL, MD, NH, PA, CT, OR) require explicit homeowner agreement</p>
                </div>
              </div>

              <label className="flex items-start gap-3 cursor-pointer group">
                <div
                  onClick={() => setConsentChecked(c => !c)}
                  className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-colors cursor-pointer ${
                    consentChecked ? 'bg-gray-900 border-gray-900' : 'border-gray-300 group-hover:border-gray-500'
                  }`}
                >
                  {consentChecked && <CheckCircle className="w-3 h-3 text-white" />}
                </div>
                <span className="text-sm text-gray-700 leading-relaxed">
                  I understand I must read the recording disclosure to the homeowner before this call begins, and I will obtain verbal consent before any recording or transcription starts.
                </span>
              </label>
            </div>

            {/* Ready to Call button */}
            <div className="bg-white border border-gray-200 rounded-2xl p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className={`w-3 h-3 rounded-full ${canProceed ? 'bg-green-500 animate-pulse' : 'bg-gray-300'}`} />
                <span className={`text-sm font-semibold ${canProceed ? 'text-green-700' : 'text-gray-500'}`}>
                  {canProceed ? 'Ready to call — all checks passed' : 'Complete the steps above to proceed'}
                </span>
              </div>

              {/* Checklist summary */}
              <div className="space-y-2 mb-5">
                {[
                  { label: 'Microphone access granted', done: state_.permissionGranted },
                  { label: 'Audio device selected', done: !!state_.selectedInputId && state_.inputConnected },
                  { label: 'Mic test completed', done: micTested, optional: true },
                  { label: 'Speaker test completed', done: speakerTested, optional: true },
                  { label: 'Recording consent acknowledged', done: consentChecked },
                ].map(item => (
                  <div key={item.label} className="flex items-center gap-2">
                    {item.done ? (
                      <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                    ) : (
                      <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 ${item.optional ? 'border-gray-200' : 'border-amber-400'}`} />
                    )}
                    <span className={`text-xs ${item.done ? 'text-green-700 font-medium' : item.optional ? 'text-gray-400' : 'text-gray-600'}`}>
                      {item.label}
                      {item.optional && !item.done && <span className="text-gray-400 ml-1">(optional)</span>}
                    </span>
                  </div>
                ))}
              </div>

              <button
                onClick={handleReadyToCall}
                disabled={!canProceed}
                className="w-full py-3.5 px-6 bg-gray-900 text-white rounded-xl font-semibold text-sm hover:bg-gray-800 transition-colors flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Radio className="w-4 h-4" />
                Ready to Call — Start Teleprompter
                <ArrowRight className="w-4 h-4" />
              </button>

              <p className="text-xs text-gray-400 text-center mt-3">
                You'll be taken to the Live Teleprompter where the call recording consent gate will appear before the session starts.
              </p>
            </div>

          </div>
        )}
      </div>
    </div>
  );
}

// ─── Page Export ──────────────────────────────────────────────────────────────

export default function HeadsetSetupPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 border-2 border-gray-300 border-t-gray-900 rounded-full animate-spin" />
      </div>
    }>
      <HeadsetSetupInner />
    </Suspense>
  );
}
