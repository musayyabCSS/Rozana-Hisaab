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
  onCaptureMedia: (blob: Blob) => Promise<boolean>;
}

const MAX_IMAGE_BASE64_LENGTH = 7_000_000;

function base64ToBlob(base64: string, mimeType: string): Blob {
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new Blob([bytes], { type: mimeType });
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Could not decode receipt image.'));
    image.src = url;
  });
}

function canvasToJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error('Could not encode receipt image.')),
      'image/jpeg',
      quality,
    );
  });
}

async function downscaleReceiptPhoto(source: Blob): Promise<Blob> {
  const objectUrl = URL.createObjectURL(source);
  try {
    const image = await loadImage(objectUrl);
    const longestSide = Math.max(image.naturalWidth, image.naturalHeight);
    if (!longestSide) throw new Error('Receipt image has invalid dimensions.');
    const scale = Math.min(1, 1600 / longestSide);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Could not prepare receipt image for processing.');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    for (let quality = 0.8; quality >= 0.1; quality = Math.round((quality - 0.1) * 10) / 10) {
      const compressed = await canvasToJpeg(canvas, quality);
      const base64Length = 4 * Math.ceil(compressed.size / 3) + 'data:image/jpeg;base64,'.length;
      if (base64Length < MAX_IMAGE_BASE64_LENGTH) return compressed;
    }
    throw new Error('Receipt photo remains too large after compression.');
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export function ScanModal({ open, onClose, language, dir, onCaptureMedia }: ScanModalProps) {
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [queuedOffline, setQueuedOffline] = useState(false);
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

  const savePhoto = async (blob: Blob) => {
    setProcessing(true);
    setCaptureError(null);
    stopCamera();
    try {
      const compressedBlob = await downscaleReceiptPhoto(blob);
      const processed = await onCaptureMediaRef.current(compressedBlob);
      if (!processed) {
        setCapturedImage(URL.createObjectURL(compressedBlob));
        setQueuedOffline(true);
        setWaitingForInternet(true);
      }
      stopCamera();
    } catch (error) {
      console.error('Could not save receipt photo locally:', error);
      setCaptureError(
        error instanceof Error && error.message.includes('too large')
          ? tr('mediaTooLargeReceipt', language)
          : tr('mediaLocalSaveFailed', language),
      );
    } finally {
      setProcessing(false);
    }
  };

  const capturePhoto = () => {
    if (Capacitor.isNativePlatform()) {
      setProcessing(true);
      stopCamera();
      void chooseNativePhoto(CameraSource.Camera);
      return;
    }
    const video = videoRef.current;
    if (!video) return;
    setProcessing(true);
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const context = canvas.getContext('2d');
    if (!context) {
      stopCamera();
      setProcessing(false);
      setCaptureError(tr('cameraCaptureFailed', language));
      return;
    }
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    stopCamera();
    canvas.toBlob((blob) => {
      if (!blob) {
        setProcessing(false);
        setCaptureError(tr('cameraCaptureFailed', language));
        return;
      }
      void savePhoto(blob);
    }, 'image/jpeg', 0.88);
  };

  const chooseNativePhoto = async (source: CameraSource) => {
    try {
      setProcessing(true);
      setCaptureError(null);
      const photo = await NativeCamera.getPhoto({
        quality: 70,
        width: 1200,
        correctOrientation: true,
        saveToGallery: false,
        allowEditing: false,
        resultType: CameraResultType.Base64,
        source,
      });
      if (!photo.base64String) throw new Error('Native camera returned no image data.');
      const mimeType = photo.format === 'png' ? 'image/png' : 'image/jpeg';
      const blob = base64ToBlob(photo.base64String, mimeType);
      await savePhoto(blob);
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
      setProcessing(false);
    }
  };

  const choosePhoto = () => {
    if (Capacitor.isNativePlatform()) {
      setProcessing(true);
      stopCamera();
      void chooseNativePhoto(CameraSource.Photos);
    } else {
      fileInputRef.current?.click();
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    stopCamera();
    void savePhoto(file);
  };

  const handleRetake = () => {
    if (capturedImage) URL.revokeObjectURL(capturedImage);
    setCapturedImage(null);
    setProcessing(false);
    setQueuedOffline(false);
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
    setProcessing(false);
    setQueuedOffline(false);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={tr('scanTitle', language)}
      subtitle={tr('scanSubtitle', language)}
      dir={dir}
      closeDisabled={processing}
    >
      <div className="space-y-4">
        {processing ? (
          <div role="status" aria-live="polite" className="flex min-h-80 flex-col items-center justify-center rounded-xl bg-slate-950/70">
            <div className="relative flex h-24 w-24 items-center justify-center">
              <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400/10" />
              <span className="absolute inset-1 animate-spin rounded-full border-2 border-teal-400/20 border-t-emerald-400" />
              <Loader2 size={34} className="animate-spin text-emerald-300" />
            </div>
            <p className="mt-5 animate-pulse text-center text-sm font-semibold text-emerald-200">
              {language === 'ur' ? 'AI Hisaab tayyar kar raha hai...' : 'Analyzing transaction...'}
            </p>
          </div>
        ) : queuedOffline ? (
          <div role="status" className="flex min-h-80 flex-col items-center justify-center text-center">
            {capturedImage && <img src={capturedImage} alt={tr('receiptPhotoAlt', language)} className="mb-4 max-h-56 w-full rounded-xl object-contain" />}
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
              disabled={!cameraReady}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 py-3 text-sm font-bold text-slate-950 disabled:opacity-50"
            >
              <Camera size={17} />
              {tr('capturePhoto', language)}
            </button>
            <button
              type="button"
              onClick={choosePhoto}
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
        </>
        )}
      </div>
    </Modal>
  );
}
