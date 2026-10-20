import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, Camera, FileUp, Loader2, RotateCcw } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { Camera as NativeCamera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Modal } from '@/components/ui/Modal';
import type { Language } from '@/types';
import { tr } from '@/lib/i18n';

interface ScanModalProps {
  open: boolean;
  onClose: () => void;
  language: Language;
  dir: 'ltr' | 'rtl';
  onCaptureMedia: (blob: Blob) => Promise<void>;
}

export function ScanModal({ open, onClose, language, dir, onCaptureMedia }: ScanModalProps) {
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [waitingForInternet, setWaitingForInternet] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const openRef = useRef(open);
  const onCaptureMediaRef = useRef(onCaptureMedia);
  openRef.current = open;
  onCaptureMediaRef.current = onCaptureMedia;

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraReady(false);
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const startCameraRef = useRef<() => Promise<void>>(async () => {});
  startCameraRef.current = async () => {
    stopCamera();
    setCameraError(null);
    if (Capacitor.isNativePlatform()) {
      setCameraReady(true);
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError(tr('cameraUnavailable', language));
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
      });
      if (!openRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      setCameraReady(true);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch (error) {
      console.error('Camera access failed:', error);
      const name = error instanceof Error ? error.name : '';
      setCameraError(
        ['NotAllowedError', 'PermissionDeniedError', 'SecurityError'].includes(name)
          ? tr('cameraPermissionRequired', language)
          : ['NotFoundError', 'DevicesNotFoundError'].includes(name)
            ? tr('cameraUnavailable', language)
            : tr('cameraStartFailed', language),
      );
    }
  };

  useEffect(() => {
    if (open && !capturedImage) void startCameraRef.current();
    else stopCamera();
    return stopCamera;
  }, [capturedImage, open, stopCamera]);

  useEffect(() => () => stopCamera(), [stopCamera]);

  const savePhoto = async (blob: Blob, previewUrl: string) => {
    setSaving(true);
    setCaptureError(null);
    try {
      await onCaptureMediaRef.current(blob);
      setCapturedImage(previewUrl);
      setWaitingForInternet(!navigator.onLine);
      stopCamera();
    } catch (error) {
      console.error('Could not save receipt photo locally:', error);
      setCaptureError(tr('mediaLocalSaveFailed', language));
      URL.revokeObjectURL(previewUrl);
    } finally {
      setSaving(false);
    }
  };

  const capturePhoto = () => {
    if (Capacitor.isNativePlatform()) {
      void chooseNativePhoto(CameraSource.Camera);
      return;
    }
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const context = canvas.getContext('2d');
    if (!context) {
      setCaptureError(tr('cameraCaptureFailed', language));
      return;
    }
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (!blob) {
        setCaptureError(tr('cameraCaptureFailed', language));
        return;
      }
      void savePhoto(blob, URL.createObjectURL(blob));
    }, 'image/jpeg', 0.88);
  };

  const chooseNativePhoto = async (source: CameraSource) => {
    try {
      const photo = await NativeCamera.getPhoto({
        quality: 88,
        allowEditing: false,
        resultType: CameraResultType.Uri,
        source,
      });
      if (!photo.webPath) throw new Error('Native camera returned no local photo path.');
      const response = await fetch(photo.webPath);
      if (!response.ok) throw new Error(`Could not read the captured photo (${response.status}).`);
      const blob = await response.blob();
      await savePhoto(blob, URL.createObjectURL(blob));
    } catch (error) {
      console.error('Native camera or gallery selection failed:', error);
      const name = error instanceof Error ? error.name : '';
      setCameraError(
        ['UserCancelled', 'CanceledOnUser'].includes(name)
          ? null
          : ['NotAllowedError', 'PermissionDeniedError', 'SecurityError'].includes(name)
            ? tr('cameraPermissionRequired', language)
            : tr('cameraStartFailed', language),
      );
    }
  };

  const choosePhoto = () => {
    if (Capacitor.isNativePlatform()) {
      void chooseNativePhoto(CameraSource.Photos);
    } else {
      fileInputRef.current?.click();
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const previewUrl = URL.createObjectURL(file);
    void savePhoto(file, previewUrl);
  };

  const handleRetake = () => {
    if (capturedImage) URL.revokeObjectURL(capturedImage);
    setCapturedImage(null);
    setWaitingForInternet(false);
    setCaptureError(null);
  };

  const handleClose = () => {
    stopCamera();
    if (capturedImage) URL.revokeObjectURL(capturedImage);
    setCapturedImage(null);
    setCameraError(null);
    setCaptureError(null);
    setWaitingForInternet(false);
    setSaving(false);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={tr('scanTitle', language)}
      subtitle={tr('scanSubtitle', language)}
      dir={dir}
    >
      <div className="space-y-4">
        {cameraError && (
          <div role="alert" className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-300">
            <AlertCircle size={15} className="mt-0.5 shrink-0" />
            <span>{cameraError}</span>
          </div>
        )}
        {captureError && (
          <p role="alert" className="text-center text-xs text-rose-300">{captureError}</p>
        )}

        <div className="relative flex aspect-[3/4] items-center justify-center overflow-hidden rounded-xl border border-slate-800 bg-slate-950">
          {capturedImage ? (
            <img src={capturedImage} alt={tr('receiptPhotoAlt', language)} className="h-full w-full object-contain" />
          ) : Capacitor.isNativePlatform() ? (
            <span className="px-6 text-center text-sm text-slate-400">{tr('cameraPlaceholder', language)}</span>
          ) : (
            <video ref={videoRef} autoPlay playsInline muted className="h-full w-full object-cover" />
          )}
          {saving && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-950/80">
              <Loader2 className="animate-spin text-emerald-400" />
              <span className="text-xs text-slate-200">{tr('savingMediaLocally', language)}</span>
            </div>
          )}
        </div>

        {waitingForInternet && (
          <p role="status" className="mx-auto w-fit rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-300">
            {tr('waitingForInternet', language)}
          </p>
        )}

        {capturedImage ? (
          <button
            type="button"
            onClick={handleRetake}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-800 py-3 text-sm text-slate-200"
          >
            <RotateCcw size={16} />
            {tr('retakePhoto', language)}
          </button>
        ) : (
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={capturePhoto}
              disabled={saving || !cameraReady}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 py-3 text-sm font-bold text-slate-950 disabled:opacity-50"
            >
              <Camera size={17} />
              {tr('capturePhoto', language)}
            </button>
            <button
              type="button"
              onClick={choosePhoto}
              disabled={saving}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-800 py-2.5 text-xs font-medium text-slate-200"
            >
              <FileUp size={16} />
              {tr('uploadGalleryPhoto', language)}
            </button>
            <button
              type="button"
              onClick={() => void startCameraRef.current()}
              className="text-xs text-slate-400 underline"
            >
              {tr('retry', language)}
            </button>
          </div>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileSelect}
          className="hidden"
        />
      </div>
    </Modal>
  );
}
