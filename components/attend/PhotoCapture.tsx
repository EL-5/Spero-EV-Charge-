'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Camera, RefreshCw } from 'lucide-react';

/**
 * Shrinks a phone/tablet photo before it is uploaded. A 12 MP camera photo is
 * 4–8 MB; the machine display is perfectly readable at 1600 px, and a small
 * file is the difference between uploading on a weak signal and giving up.
 */
async function compressImage(file: File, maxSide = 1600, quality = 0.82): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (!blob || blob.size === 0 || blob.size >= file.size) return file;
    return new File([blob], 'display.jpg', { type: 'image/jpeg', lastModified: Date.now() });
  } catch {
    return file; // e.g. a format the browser cannot decode: upload the original
  }
}

interface Props {
  /** Shown above the button, e.g. "Photo of the display". */
  label: string;
  file: File | null;
  onChange: (file: File | null) => void;
  disabled?: boolean;
  /** What the photo shows, for the preview text. */
  subject?: string;
}

/**
 * Opens the device camera (back camera on tablets and phones).
 *
 * Note: the `capture` attribute asks the browser for the camera, but a web
 * page cannot forbid choosing a gallery photo on every device. The server
 * therefore treats photos as evidence for a manager to look at, and the upload
 * time is stamped by the server, not by the file.
 */
export default function PhotoCapture({ label, file, onChange, disabled, subject = 'the machine display' }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  // The preview URL is derived from the file, and released when the file changes.
  const preview = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  const pick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0];
    e.target.value = ''; // so retaking the same photo still fires onChange
    if (!picked) return;
    setBusy(true);
    onChange(await compressImage(picked));
    setBusy(false);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="text-sm font-semibold">{label}</div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        onChange={pick}
        disabled={disabled}
        aria-label={label}
      />
      {file && preview ? (
        <div className="flex items-center gap-4 rounded-[22px] border border-line bg-white p-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt={`Photo of ${subject}`} className="h-20 w-20 flex-shrink-0 rounded-2xl object-cover" />
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-semibold">Photo added</div>
            <div className="text-xs text-ink-soft">{Math.round(file.size / 1024)} KB · make sure it is readable</div>
          </div>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={disabled || busy}
            className="att-btn att-btn-ghost !min-h-[48px] !rounded-2xl !px-4 !text-sm"
          >
            <RefreshCw size={16} /> Retake
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={disabled || busy}
          className="flex min-h-[88px] items-center justify-center gap-3 rounded-[22px] border-2 border-dashed border-[#a9bbd9] bg-ground text-base font-semibold text-navy transition hover:bg-white disabled:opacity-60"
        >
          <Camera size={26} aria-hidden />
          {busy ? 'Preparing photo…' : 'Take photo'}
        </button>
      )}
    </div>
  );
}
