import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, Loader2, Mic, Square, Volume2 } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import type { Language } from '@/types';
import { tr } from '@/lib/i18n';
import { AUDIO_BITRATE, getMicrophoneConstraints, pickAudioMimeType } from '@/lib/audioRecorder';

interface VoiceModalProps {
  open: boolean;
  onClose: () => void;
  language: Language;
  dir: 'ltr' | 'rtl';
  onCaptureMedia: (blob: Blob) => Promise<boolean>;
}

function formatTimer(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
}

const MAX_RECORDING_SECONDS = 60;

export function VoiceModal({ open, onClose, language, dir, onCaptureMedia }: VoiceModalProps) {
  const [recording, setRecording] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [processingStep, setProcessingStep] = useState(0);
  const [queuedOffline, setQueuedOffline] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [waitingForInternet, setWaitingForInternet] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const stopRecordingRef = useRef<() => void>(() => {});
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
      const stream = await navigator.mediaDevices.getUserMedia(getMicrophoneConstraints());
      if (requestId !== requestIdRef.current || !openRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      const mimeType = pickAudioMimeType();
      const recorderOptions: MediaRecorderOptions = { audioBitsPerSecond: AUDIO_BITRATE };
      if (mimeType) recorderOptions.mimeType = mimeType;
      const recorder = new MediaRecorder(stream, recorderOptions);
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || mimeType || 'audio/webm',
        });
        chunksRef.current = [];
        const processingStartedAt = Date.now();
        setProcessingStep(0);
        const progressTimer = window.setInterval(() => {
          const elapsed = Date.now() - processingStartedAt;
          setProcessingStep(elapsed < 1800 ? 0 : elapsed < 3500 ? 1 : 2);
        }, 150);
        void onCaptureMediaRef.current(blob).then((processed) => {
          if (!processed) {
            setQueuedOffline(true);
            setWaitingForInternet(true);
          }
        }).catch((saveError: unknown) => {
          console.error('Could not save voice recording locally:', saveError);
          setError(language === 'ur'
            ? 'لین دین کا تجزیہ نہیں ہو سکا۔ دوبارہ کوشش کریں۔'
            : 'Could not analyze the transaction. Please try again.');
        }).finally(() => {
          window.clearInterval(progressTimer);
          setProcessing(false);
          setProcessingStep(0);
          setRecording(false);
          releaseMicrophone();
        });
      };
      recorderRef.current = recorder;
      recorder.start();
      setRecording(true);
      let elapsedSeconds = 0;
      timerRef.current = window.setInterval(() => {
        elapsedSeconds += 1;
        setRecordSeconds(elapsedSeconds);
        if (elapsedSeconds >= MAX_RECORDING_SECONDS) stopRecordingRef.current();
      }, 1000);
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
    setProcessing(false);
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
    if (recorderRef.current?.state === 'recording') {
      setProcessing(true);
      setProcessingStep(0);
      recorderRef.current.stop();
    } else {
      requestIdRef.current += 1;
    }
    releaseMicrophone();
  };
  stopRecordingRef.current = handleStop;

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
    setProcessing(false);
    setQueuedOffline(false);
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
      closeDisabled={processing}
    >
      <div className="flex flex-col items-center py-6">
        {processing ? (
          <div role="status" aria-live="polite" className="flex min-h-56 flex-col items-center justify-center">
            <div className="relative flex h-24 w-24 items-center justify-center">
              <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400/10" />
              <span className="absolute inset-1 rounded-full border-2 border-teal-400/20 border-t-emerald-400 animate-spin" />
              <Loader2 size={34} className="animate-spin text-emerald-300" />
            </div>
            <p className="mt-5 animate-pulse text-center text-sm font-semibold text-emerald-200">
              {processingStep === 0
                ? language === 'ur' ? '🎤 Audio sun rahe hain...' : '🎤 Transcribing voice note...'
                : processingStep === 1
                  ? language === 'ur' ? '🧠 Hisaab samajh rahe hain...' : '🧠 Extracting amounts & categories...'
                  : '✨ Preparing review...'}
            </p>
          </div>
        ) : queuedOffline ? (
          <div role="status" className="flex min-h-56 flex-col items-center justify-center text-center">
            <p className="text-sm font-semibold text-amber-300">
              {language === 'ur'
                ? 'Internet connect nahi hai. Offline save ho gaya hai.'
                : '📶 Internet disconnected. Saved locally and will process when you reconnect.'}
            </p>
            <button type="button" onClick={handleClose} className="mt-5 rounded-xl border border-slate-700 px-5 py-2.5 text-sm text-slate-200">
              {language === 'ur' ? 'بند کریں' : 'Close'}
            </button>
          </div>
        ) : (
        <>
        <button
          type="button"
          onClick={recording ? handleStop : () => void startRecordingRef.current()}
          aria-label={recording ? (language === 'ur' ? 'ریکارڈنگ روکیں' : 'Stop recording') : (language === 'ur' ? 'ریکارڈنگ شروع کریں' : 'Start recording')}
          className={`relative flex h-20 w-20 items-center justify-center rounded-full transition-all disabled:opacity-50 ${
            recording ? 'scale-110 bg-rose-500/20' : 'bg-slate-800 hover:bg-slate-700'
          }`}
        >
          {recording && <span className="absolute inset-0 animate-ping rounded-full bg-rose-500/20" />}
          {recording
            ? <Square size={28} className="relative z-10 text-rose-400" fill="currentColor" />
            : <Mic size={32} className="text-slate-300" />}
        </button>

        {recording && (
          <>
            <p className="mt-4 text-lg font-bold tabular-nums text-rose-400">{formatTimer(MAX_RECORDING_SECONDS - recordSeconds)}</p>
            <p className="mt-1 text-xs text-slate-400">{tr('voiceMaxDuration', language)}</p>
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
        </>
        )}
      </div>
    </Modal>
  );
}
