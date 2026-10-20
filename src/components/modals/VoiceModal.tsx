import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, Loader2, Mic, Square, Volume2 } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import type { Language } from '@/types';
import { tr } from '@/lib/i18n';

interface VoiceModalProps {
  open: boolean;
  onClose: () => void;
  language: Language;
  dir: 'ltr' | 'rtl';
  onCaptureMedia: (blob: Blob) => Promise<void>;
}

function formatTimer(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
}

function pickMimeType(): string {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/aac', 'audio/wav'];
  for (const type of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type)) return type;
  }
  return '';
}

export function VoiceModal({ open, onClose, language, dir, onCaptureMedia }: VoiceModalProps) {
  const [recording, setRecording] = useState(false);
  const [saving, setSaving] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [waitingForInternet, setWaitingForInternet] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const requestIdRef = useRef(0);
  const openRef = useRef(open);
  const onCaptureMediaRef = useRef(onCaptureMedia);
  openRef.current = open;
  onCaptureMediaRef.current = onCaptureMedia;

  const releaseMicrophone = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const clearTimer = useCallback(() => {
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = null;
  }, []);

  const startRecordingRef = useRef<() => Promise<void>>(async () => {});
  startRecordingRef.current = async () => {
    setError(null);
    setWaitingForInternet(false);
    setRecordSeconds(0);
    const requestId = ++requestIdRef.current;
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Microphone access is not supported on this device.');
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (requestId !== requestIdRef.current || !openRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      const mimeType = pickMimeType();
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || mimeType || 'audio/webm',
        });
        chunksRef.current = [];
        setSaving(true);
        void onCaptureMediaRef.current(blob).then(() => {
          setWaitingForInternet(!navigator.onLine);
        }).catch((saveError: unknown) => {
          console.error('Could not save voice recording locally:', saveError);
          setError(language === 'ur'
            ? 'آواز کی ریکارڈنگ اس ڈیوائس پر محفوظ نہیں ہو سکی۔'
            : 'Could not save the voice recording on this device.');
        }).finally(() => {
          setSaving(false);
          setRecording(false);
          releaseMicrophone();
        });
      };
      recorderRef.current = recorder;
      recorder.start();
      setRecording(true);
      timerRef.current = window.setInterval(() => setRecordSeconds((seconds) => seconds + 1), 1000);
    } catch (permissionError) {
      if (requestId !== requestIdRef.current) return;
      const name = permissionError instanceof Error ? permissionError.name : '';
      const message = ['NotAllowedError', 'PermissionDeniedError', 'SecurityError'].includes(name)
        ? language === 'ur'
          ? 'مائیکروفون کی اجازت ضروری ہے۔ براہ کرم اپنے آلے یا ایپ کی ترتیبات میں مائیکروفون تک رسائی کی اجازت دیں۔'
          : 'Microphone permission is required. Please allow microphone access in your device or app settings.'
        : language === 'ur'
          ? 'مائیکروفون شروع نہیں ہو سکا۔ مائیکروفون اور ایپ کی اجازتیں چیک کریں۔'
          : 'Could not start the microphone. Check microphone availability and app permissions.';
      setError(message);
      setRecording(false);
      releaseMicrophone();
    }
  };

  useEffect(() => {
    if (!open) return;
    const timeoutId = window.setTimeout(() => void startRecordingRef.current(), 300);
    return () => window.clearTimeout(timeoutId);
  }, [open]);

  useEffect(() => {
    if (open) return;
    requestIdRef.current += 1;
    clearTimer();
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.onstop = null;
      recorderRef.current.stop();
    }
    recorderRef.current = null;
    chunksRef.current = [];
    releaseMicrophone();
    setRecording(false);
    setSaving(false);
  }, [clearTimer, open, releaseMicrophone]);

  useEffect(() => () => {
    requestIdRef.current += 1;
    clearTimer();
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.onstop = null;
      recorderRef.current.stop();
    }
    releaseMicrophone();
  }, [clearTimer, releaseMicrophone]);

  const handleStop = () => {
    clearTimer();
    setRecording(false);
    setSaving(true);
    if (recorderRef.current?.state === 'recording') {
      recorderRef.current.stop();
    } else {
      setSaving(false);
      requestIdRef.current += 1;
    }
    releaseMicrophone();
  };

  const handleClose = () => {
    requestIdRef.current += 1;
    clearTimer();
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.onstop = null;
      recorderRef.current.stop();
    }
    recorderRef.current = null;
    chunksRef.current = [];
    releaseMicrophone();
    setRecording(false);
    setSaving(false);
    setWaitingForInternet(false);
    setError(null);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={tr('voiceTitle', language)}
      subtitle={tr('voiceExample', language)}
      dir={dir}
    >
      <div className="flex flex-col items-center py-6">
        <button
          type="button"
          onClick={recording ? handleStop : () => void startRecordingRef.current()}
          disabled={saving}
          aria-label={recording ? (language === 'ur' ? 'ریکارڈنگ روکیں' : 'Stop recording') : (language === 'ur' ? 'ریکارڈنگ شروع کریں' : 'Start recording')}
          className={`relative flex h-20 w-20 items-center justify-center rounded-full transition-all disabled:opacity-50 ${
            recording ? 'scale-110 bg-rose-500/20' : 'bg-slate-800 hover:bg-slate-700'
          }`}
        >
          {recording && <span className="absolute inset-0 animate-ping rounded-full bg-rose-500/20" />}
          {recording
            ? <Square size={28} className="relative z-10 text-rose-400" fill="currentColor" />
            : saving
              ? <Loader2 size={28} className="animate-spin text-emerald-400" />
              : <Mic size={32} className="text-slate-300" />}
        </button>

        {recording && (
          <>
            <p className="mt-4 text-lg font-bold tabular-nums text-rose-400">{formatTimer(recordSeconds)}</p>
            <div className="mt-4 flex h-12 items-center gap-1">
              {Array.from({ length: 24 }).map((_, index) => (
                <span
                  key={index}
                  className="w-1 animate-[wave_0.8s_ease-in-out_infinite] rounded-full bg-emerald-400"
                  style={{ height: '100%', animationDelay: `${index * 0.06}s` }}
                />
              ))}
            </div>
            <p className="mt-4 flex items-center gap-1.5 text-sm font-medium text-rose-400">
              <Volume2 size={14} />
              {tr('voiceListening', language)}
            </p>
          </>
        )}

        {saving && (
          <p className="mt-4 text-sm text-slate-300">
            {language === 'ur' ? 'ریکارڈنگ اس ڈیوائس پر محفوظ ہو رہی ہے...' : 'Saving recording on this device...'}
          </p>
        )}
        {waitingForInternet && (
          <p role="status" className="mt-4 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-300">
            {tr('waitingForInternet', language)}
          </p>
        )}
        {error && (
          <p role="alert" className="mt-4 flex max-w-xs items-center gap-1.5 text-center text-sm text-amber-400">
            <AlertCircle size={14} className="shrink-0" />
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
