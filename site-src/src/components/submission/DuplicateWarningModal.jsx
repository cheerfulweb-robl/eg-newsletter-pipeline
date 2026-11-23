import React from 'react';
import { AlertTriangle, Calendar, MapPin, ExternalLink, ArrowRight, X } from 'lucide-react';

export default function DuplicateWarningModal({
  isOpen,
  matchedListing,
  matchReasons = [],
  score = 0,
  onCancel,
  onBypass,
  isSubmitting = false
}) {
  if (!isOpen || !matchedListing) return null;

  const isApproved = matchedListing.status === 'approved';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="duplicate-modal-title"
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto pt-6 pb-8 px-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-amber-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="bg-amber-50 border-b border-amber-100 p-5 flex items-start gap-4">
          <div className="w-10 h-10 rounded-full bg-amber-100 border border-amber-300 flex items-center justify-center shrink-0 text-amber-700">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0 pr-6">
            <h2 id="duplicate-modal-title" className="text-lg font-black text-gray-900 tracking-tight">
              Possible Duplicate Listing Found
            </h2>
            <p className="text-xs font-medium text-amber-800 mt-1">
              We detected a listing that closely matches the date, title, or location you entered ({score}% match confidence).
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Close dialog"
            className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 p-1 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 overflow-y-auto space-y-4">
          {/* Matched Listing Card */}
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-black uppercase tracking-wider text-gray-500">
                Existing Listing
              </span>
              <span
                className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                  isApproved
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                    : 'bg-blue-100 text-blue-800 border border-blue-200'
                }`}
              >
                {isApproved ? 'Live on Website' : 'Under Staff Review'}
              </span>
            </div>

            <h3 className="text-base font-black text-gray-900 leading-snug">
              {matchedListing.title || 'Untitled Event'}
            </h3>

            <div className="grid grid-cols-1 gap-1.5 text-xs text-gray-600 pt-1">
              {matchedListing.event_date_label && (
                <div className="flex items-center gap-2">
                  <Calendar className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                  <span className="font-semibold text-gray-800">{matchedListing.event_date_label}</span>
                </div>
              )}
              {(matchedListing.location || matchedListing.community) && (
                <div className="flex items-center gap-2">
                  <MapPin className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                  <span>
                    {matchedListing.location ? `${matchedListing.location}, ` : ''}
                    <strong className="text-gray-800">{matchedListing.community || 'East Gwillimbury'}</strong>
                  </span>
                </div>
              )}
              {matchedListing.link && (
                <div className="flex items-center gap-2 pt-0.5">
                  <ExternalLink className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                  <a
                    href={matchedListing.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#00008b] hover:underline truncate max-w-xs"
                  >
                    {matchedListing.link}
                  </a>
                </div>
              )}
            </div>
          </div>

          {/* Match reasons */}
          {matchReasons && matchReasons.length > 0 && (
            <div>
              <div className="text-[11px] font-black uppercase tracking-wider text-gray-500 mb-1.5">
                Matched factors
              </div>
              <div className="flex flex-wrap gap-1.5">
                {matchReasons.map((reason, idx) => (
                  <span
                    key={idx}
                    className="text-xs font-semibold px-2.5 py-1 bg-amber-50 text-amber-900 border border-amber-200 rounded-lg"
                  >
                    ✓ {reason}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Help notice */}
          <div className="text-xs text-gray-500 bg-blue-50/60 border border-blue-100 rounded-xl p-3">
            If this is the same event, you do not need to submit it again. If your event is distinct (e.g. part 2, a different session, or an update), you may bypass this check and request manual staff review.
          </div>
        </div>

        {/* Footer Actions */}
        <div className="bg-gray-50 border-t border-gray-100 p-4 flex flex-col-reverse sm:flex-row items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className="w-full sm:w-auto px-4 py-2.5 rounded-xl border border-gray-300 bg-white hover:bg-gray-50 text-xs font-bold text-gray-700 transition-colors"
          >
            Never Mind, Cancel Submission
          </button>
          <button
            type="button"
            onClick={onBypass}
            disabled={isSubmitting}
            className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white text-xs font-black tracking-wide shadow-sm transition-all flex items-center justify-center gap-1.5"
          >
            {isSubmitting ? (
              'Submitting...'
            ) : (
              <>
                <span>Submit Anyway (Request Review)</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
