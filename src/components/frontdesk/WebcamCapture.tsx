'use client';

import { useRef, useState, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Camera, RefreshCw, Check, AlertCircle } from 'lucide-react';

interface WebcamCaptureProps {
  onCapture: (base64Image: string) => void;
  capturedImage?: string | null;
  autoStart?: boolean;
}

export function WebcamCapture({ onCapture, capturedImage, autoStart = false }: WebcamCaptureProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(capturedImage || null);
  const [hasAcceptedPhoto, setHasAcceptedPhoto] = useState(!!capturedImage);
  const [cameraPermissionState, setCameraPermissionState] = useState<'prompt' | 'granted' | 'denied' | 'unavailable'>('prompt');

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsStreaming(false);
  }, []);

  const startCamera = useCallback(async () => {
    setError(null);
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setCameraPermissionState('unavailable');
        setError('Camera is not supported in this browser. Please try a different browser.');
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
      });

      streamRef.current = stream;
      setCameraPermissionState('granted');

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
        setIsStreaming(true);
      }
    } catch (err: any) {
      console.error('Camera error:', err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setCameraPermissionState('denied');
        setError('Camera permission denied. Please allow camera access in your browser settings and try again.');
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        setCameraPermissionState('unavailable');
        setError('No camera device found. Please connect a camera and try again.');
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        setError('Camera is already in use by another application. Please close other camera apps and try again.');
      } else {
        setError('Unable to access camera. Please check your browser settings.');
      }
    }
  }, []);

  const capturePhoto = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const base64 = canvas.toDataURL('image/jpeg', 0.85);
    setPreview(base64);
    stopCamera();
  }, [stopCamera]);

  const acceptPhoto = useCallback(() => {
    if (preview) {
      onCapture(preview);
      setHasAcceptedPhoto(true);
    }
  }, [preview, onCapture]);

  const retakePhoto = useCallback(() => {
    setPreview(null);
    setHasAcceptedPhoto(false);
    startCamera();
  }, [startCamera]);

  useEffect(() => {
    if (autoStart && !capturedImage && !preview) {
      startCamera();
    }
    return () => {
      stopCamera();
    };
  }, [autoStart, capturedImage, preview, startCamera, stopCamera]);

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  return (
    <div className="space-y-4">
      <div className="relative w-full max-w-sm aspect-video bg-neutral-900 rounded-lg overflow-hidden border border-neutral-700 flex items-center justify-center">
        {preview ? (
          <img src={preview} alt="Captured guest photo" className="w-full h-full object-cover" />
        ) : (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className={'w-full h-full object-cover ' + (isStreaming ? 'block' : 'hidden')}
          />
        )}
        {!isStreaming && !preview && (
          <div className="text-center p-4 text-neutral-400">
            <Camera className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-xs">
              {cameraPermissionState === 'denied'
                ? 'Camera permission denied'
                : cameraPermissionState === 'unavailable'
                ? 'Camera not available'
                : 'Webcam feed is inactive'}
            </p>
          </div>
        )}
      </div>

      <canvas ref={canvasRef} className="hidden" />

      {error && (
        <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded text-xs text-red-700">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p>{error}</p>
            {(cameraPermissionState === 'denied' || cameraPermissionState === 'unavailable') && (
              <Button type="button" variant="outline" size="sm" onClick={startCamera} className="mt-1">
                <RefreshCw className="w-3 h-3 mr-1" /> Try Again
              </Button>
            )}
          </div>
        </div>
      )}

      <div className="flex gap-2">
        {!isStreaming && !preview && (
          <Button type="button" variant="outline" size="sm" onClick={startCamera}>
            <Camera className="w-4 h-4 mr-2" /> Start Camera
          </Button>
        )}
        {isStreaming && (
          <Button type="button" variant="primary" size="sm" onClick={capturePhoto}>
            <Check className="w-4 h-4 mr-2" /> Capture Photo
          </Button>
        )}
        {preview && !hasAcceptedPhoto && (
          <>
            <Button type="button" variant="outline" size="sm" onClick={retakePhoto}>
              <RefreshCw className="w-4 h-4 mr-2" /> Retake
            </Button>
            <Button type="button" variant="primary" size="sm" onClick={acceptPhoto}>
              <Check className="w-4 h-4 mr-2" /> Use This Photo
            </Button>
          </>
        )}
        {hasAcceptedPhoto && (
          <div className="flex items-center gap-2 text-xs text-emerald-700">
            <Check className="w-4 h-4" />
            <span>Photo accepted</span>
            <Button type="button" variant="outline" size="sm" onClick={retakePhoto} className="ml-2">
              <RefreshCw className="w-3 h-3 mr-1" /> Retake
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
