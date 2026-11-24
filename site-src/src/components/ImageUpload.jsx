import React, { useRef, useState } from 'react';
import { Camera, Image as ImageIcon, X, RefreshCw, ExternalLink } from 'lucide-react';

export default function ImageUpload({ value, onChange, label = "Listing Image (Optional)", disabled = false }) {
  const fileInputRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const MAX_FILE_BYTES = 15 * 1024 * 1024; // 15 MB raw phone photo (auto-resized to 400px WebP)

  // Resize image client-side to fit 400px wide and auto-compress to WebP
  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Please select a valid image file (JPG, PNG, WEBP).');
      e.target.value = '';
      return;
    }

    if (file.size > MAX_FILE_BYTES) {
      setError('Image file size must be 15 MB or smaller.');
      e.target.value = '';
      return;
    }

    setLoading(true);
    setError(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const TARGET_WIDTH = 400;
        let width = img.width;
        let height = img.height;

        // Scale to 400px width preserving aspect ratio
        if (width !== TARGET_WIDTH) {
          const ratio = TARGET_WIDTH / width;
          width = TARGET_WIDTH;
          height = Math.round(height * ratio);
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        // Auto-compress to WebP (85% quality), falling back to JPEG only if WebP encoding is unsupported
        let dataUrl = canvas.toDataURL('image/webp', 0.85);
        if (!dataUrl.startsWith('data:image/webp')) {
          dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        }
        onChange(dataUrl);
        setLoading(false);
      };
      img.onerror = () => {
        setError('Failed to process image file.');
        setLoading(false);
      };
      img.src = event.target.result;
    };
    reader.onerror = () => {
      setError('Failed to read image file.');
      setLoading(false);
    };
    reader.readAsDataURL(file);
  };

  const handleRemove = () => {
    onChange('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const openFullScreen = () => {
    if (value) {
      window.open(value, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <div className="space-y-2 text-left">
      <div className="flex items-center justify-between">
        <label className="block text-xs font-black uppercase tracking-wider text-gray-700">
          {label}
        </label>
        <span className="text-[11px] font-bold text-gray-500">
          Required size: 400px wide × 100% height
        </span>
      </div>

      <input
        type="file"
        ref={fileInputRef}
        accept="image/jpeg,image/png,image/webp"
        onChange={handleFileChange}
        disabled={disabled || loading}
        className="hidden"
      />

      {value ? (
        <div className="p-4 rounded-2xl border border-gray-200 bg-gray-50 flex flex-col items-center gap-4 text-left">
          <div className="relative group w-full flex justify-center">
            <img
              src={value}
              alt="Listing preview"
              onClick={openFullScreen}
              className="w-[400px] max-w-full h-full object-cover rounded-xl border border-gray-300 shadow-sm cursor-pointer hover:opacity-95 transition-opacity"
              title="Click to view full screen in new window"
            />
            <button
              type="button"
              onClick={openFullScreen}
              className="absolute bottom-2 right-2 p-1.5 rounded-lg bg-black/70 text-white hover:bg-black transition-colors"
              title="View full screen"
            >
              <ExternalLink className="w-4 h-4" />
            </button>
          </div>

          <div className="w-full space-y-2 text-left">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-md bg-amber-100 text-amber-900 border border-amber-200 text-[11px] font-bold">
                Pending Admin Approval
              </span>
              <span className="text-[11px] text-gray-500">
                Size: 400px wide × 100% height • Display activated once approved
              </span>
            </div>
            <p className="text-xs text-gray-600 leading-snug">
              This image will be displayed on the full event/sale page and details modal using this exact 400px wide × 100% height presentation.
            </p>
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={disabled || loading}
                className="px-3.5 py-2 rounded-xl border border-gray-300 bg-white text-gray-700 text-xs font-bold hover:bg-gray-100 transition-colors flex items-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Replace Image</span>
              </button>
              <button
                type="button"
                onClick={handleRemove}
                disabled={disabled || loading}
                className="px-3.5 py-2 rounded-xl border border-rose-200 bg-rose-50 text-rose-700 text-xs font-bold hover:bg-rose-100 transition-colors flex items-center gap-1"
              >
                <X className="w-3.5 h-3.5" />
                <span>Remove</span>
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div
          role="button"
          tabIndex={0}
          aria-label="Upload custom photo"
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              fileInputRef.current?.click();
            }
          }}
          className="border-2 border-dashed border-gray-300 hover:border-[#00008b] focus:outline-none focus:ring-2 focus:ring-[#00008b] bg-white hover:bg-blue-50/30 rounded-2xl p-4 sm:p-5 cursor-pointer transition-all flex flex-col sm:flex-row items-center gap-4 text-left"
        >
          <div className="relative shrink-0">
            <img
              src="/placeholder-eg-500x500.png"
              alt="Default listing preview"
              className="w-20 h-20 sm:w-24 sm:h-24 aspect-square object-cover rounded-xl border border-gray-200 shadow-sm"
            />
            <span className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 px-1.5 py-0.5 rounded bg-gray-800 text-white text-[9px] font-bold whitespace-nowrap">
              Default
            </span>
          </div>
          <div className="flex-1 text-center sm:text-left">
            <p className="text-sm font-black text-gray-900 flex items-center justify-center sm:justify-start gap-1.5">
              {loading ? <RefreshCw className="w-4 h-4 animate-spin text-[#00008b]" /> : <Camera className="w-4 h-4 text-[#00008b]" />}
              <span>{loading ? 'Processing image...' : 'Upload Custom Photo (Optional)'}</span>
            </p>
            <p className="text-xs font-bold text-[#00008b] mt-1">
              Default image is shown if none uploaded. Custom uploads resize to 400px wide (preserving ratio).
            </p>
            <p className="text-[11px] text-gray-500 mt-0.5">
              JPG, PNG, or WEBP up to 15 MB. Auto-resized &amp; compressed to WebP.
            </p>
          </div>
        </div>
      )}

      {error && (
        <p className="text-xs font-bold text-rose-600 mt-1">
          {error}
        </p>
      )}
    </div>
  );
}
