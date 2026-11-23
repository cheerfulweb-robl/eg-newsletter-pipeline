import React from 'react';

export default function AgreementCheckboxes({
  agreePrivacy,
  setAgreePrivacy,
  agreeTerms,
  setAgreeTerms,
  disabled = false
}) {
  return (
    <div className="p-4 sm:p-5 rounded-2xl bg-gray-50/80 border border-gray-200/90 space-y-3 text-left">
      <span className="text-[11px] font-black uppercase tracking-wider text-gray-500 block">
        Required Legal Affirmations
      </span>

      <div className="space-y-2.5">
        <label className="flex items-start gap-3 cursor-pointer select-none text-left">
          <input
            type="checkbox"
            required
            checked={agreePrivacy}
            onChange={(e) => setAgreePrivacy(e.target.checked)}
            disabled={disabled}
            className="mt-0.5 w-4 h-4 rounded border-gray-300 text-[#00008b] focus:ring-[#00008b]"
          />
          <span className="text-xs font-semibold text-gray-700 leading-snug">
            I agree to the{' '}
            <a
              href="/privacy"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#00008b] underline font-bold hover:text-blue-900"
            >
              Privacy Policy
            </a>
            {' '}<span className="text-rose-500 font-bold">*</span>
          </span>
        </label>

        <label className="flex items-start gap-3 cursor-pointer select-none text-left">
          <input
            type="checkbox"
            required
            checked={agreeTerms}
            onChange={(e) => setAgreeTerms(e.target.checked)}
            disabled={disabled}
            className="mt-0.5 w-4 h-4 rounded border-gray-300 text-[#00008b] focus:ring-[#00008b]"
          />
          <span className="text-xs font-semibold text-gray-700 leading-snug">
            I agree to the{' '}
            <a
              href="/terms"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#00008b] underline font-bold hover:text-blue-900"
            >
              Terms of Service
            </a>
            {' '}<span className="text-rose-500 font-bold">*</span>
          </span>
        </label>
      </div>
    </div>
  );
}
