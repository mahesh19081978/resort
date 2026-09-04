'use client';

import { useRef, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Camera, RefreshCw, Check } from 'lucide-react';

interface WebcamCaptureProps {
  onCapture: (base64Image: string) => void;
  capturedImage?: string | null;
}

export function WebcamCapture({ onCapture, capturedImage }: WebcamCaptureProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(capturedImage || null);

  const startCamera = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
        setIsStreaming(true);
      }
    } catch (err: any) {
      console.error('Camera error:', err);
      setError('Camera access denied or device not found.');
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach((track) => track.stop());
      videoRef.current.srcObject = null;
      setIsStreaming(false);
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
    onCapture(base64);
    stopCamera();
  }, [onCapture, stopCamera]);

  const retakePhoto = () => {
    setPreview(null);
    startCamera();
  };

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
            className={'w-full h-ufull object-cover ' + (isStreaming ? 'block' : 'hidden')}
          />
        )}
        {!isStreaming && !preview && (
          <div className="text-center p-4 text-neutral-400">
            <Camera className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-xs">Webcam feed is inactive</p>
          </div>
        )}
      </div>


      <canvas ref={canvasRef} className="hidden" />


      {error && <p className="text-xs text-red-500">{error}</p>}

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
        {preview && (
          <Button type="button" variant="outline" size="sm" onClick={retakePhoto}>
            <RefreshCw className="w-4 h-4 mr-2" /> Retake
          </Button>
        )}
      </div>
    </div>
  );
}
