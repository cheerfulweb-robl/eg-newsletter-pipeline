import React, { useState, useEffect } from 'react';
import { Flag, X, CheckCircle2, AlertCircle, Send } from 'lucide-react';
import { supabase } from '../supabaseClient';

const REASONS = [
  'Dates or times have changed',
  'Event or offer has ended / expired',
  'Price, deal, or menu details are different',
  'Location or address is incorrect',
  'Business is temporarily or permanently closed',
  'Other inaccurate information'
];

export default function SomethingChangedModal({
  isOpen,
  onClose,
  itemTitle = '',
  businessName = '',
  category = ''
}) {
  const [reason, setReason] = useState(REASONS[0]);
  const [details, setDetails] = useState('');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [pageUrl, setPageUrl] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setPageUrl(window.location.href);
    }
    if (isOpen) {
      setSubmitted(false);
      setErrorMsg('');
    }
  }, [isOpen]);

  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const listingInfo = [itemTitle, businessName].filter(Boolean).join(' • ');

  const handleSubmit = async (e) => {
    e.preventDefault();
    const cleanDetails = details.trim();
    if (cleanDetails.length < 10) {
      setErrorMsg('Please describe what has changed (at least 10 characters).');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg('');

    const payload = {
      report_type: 'listing_correction',
      name: name.trim() || 'Community Resident',
      email: email.trim(),
      page_url: pageUrl || (typeof window !== 'undefined' ? window.location.href : ''),
      listing_info: listingInfo,
      message: `[${reason}] ${cleanDetails}`
    };

    let delivered = false;

    // 1. Dispatch email to staff via server endpoint
    try {
      const res = await fetch('/api/send_bug_report.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      delivered = res.ok && (await res.json().catch(() => ({}))).success === true; // 200 alone is not enough
    } catch (err) {
      console.warn('Listing report endpoint notice:', err);
    }

    // 2. Try recording in Supabase bug_reports table
    try {
      if (supabase) {
        const { error: insErr } = await supabase.from('bug_reports').insert([{
          name: payload.name,
          email: payload.email || null,
          page_url: payload.page_url,
          message: `[Listing Correction: ${listingInfo}] [${reason}] ${cleanDetails}`,
          recipient: 'contact@welcomeeg.ca',
          created_at: new Date().toISOString(),
          status: 'listing_update'
        }]);
        if (!insErr) delivered = true;
      }
    } catch (err) {
      console.warn('Supabase listing report skipped:', err);
    }

    setIsSubmitting(false);

    if (!delivered) {
      setErrorMsg('Could not send report right now. Please email contact@welcomeeg.ca with your correction.');
      return;
    }

    setSubmitted(true);
    setTimeout(() => {
      setSubmitted(false);
      setDetails('');
      setName('');
      setEmail('');
      onClose();
    }, 2500);
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-sm flex items-start justify-center pt-6 pb-8 px-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="something-changed-title"
    >
      <div className="bg-white rounded-3xl max-w-2xl w-full p-6 sm:p-10 shadow-2xl border-2 border-black relative my-8 animate-in fade-in zoom-in duration-200">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-5 right-5 text-black hover:bg-gray-200 p-2 rounded-full transition"
          aria-label="Close"
        >
          <X className="w-7 h-7 text-black stroke-[2.5]" />
        </button>

        {submitted ? (
          <div className="py-10 text-center flex flex-col items-center">
            <CheckCircle2 className="w-20 h-20 text-emerald-600 mb-4" />
            <h3 className="text-3xl sm:text-4xl font-black text-black mb-3">Thank You!</h3>
            <p className="text-lg sm:text-xl font-bold text-black max-w-md leading-relaxed">
              Our staff has received your correction notice for <strong>{itemTitle || 'this listing'}</strong> and will review it promptly.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="flex items-center gap-2.5 text-red-600">
              <Flag className="w-7 h-7 text-red-600 fill-red-600 shrink-0" />
              <span className="text-base sm:text-lg font-black uppercase tracking-wider text-red-600">
                Correction Notice
              </span>
            </div>

            <div>
              <h2 id="something-changed-title" className="text-3xl sm:text-4xl font-black text-black tracking-tight leading-tight">
                Something changed?
              </h2>
              <p className="text-base sm:text-lg font-bold text-black mt-2 leading-relaxed">
                Notice outdated dates, an expired special, a wrong address, or a closed venue? Let our staff know so we can keep East Gwillimbury updated.
              </p>
            </div>

            {listingInfo && (
              <div className="p-4 bg-gray-100 border-2 border-black rounded-2xl text-black">
                <span className="text-black font-black block text-sm uppercase tracking-wider mb-1">
                  Listing
                </span>
                <span className="text-lg sm:text-xl font-black text-black break-words block">
                  {listingInfo}
                </span>
              </div>
            )}

            <div>
              <label htmlFor="sc-reason" className="block text-lg sm:text-xl font-black text-black mb-2">
                What needs updating? *
              </label>
              <select
                id="sc-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full text-base sm:text-lg font-bold border-2 border-black rounded-2xl px-4 py-3.5 bg-white text-black focus:outline-none focus:ring-4 focus:ring-blue-500"
              >
                {REASONS.map((r) => (
                  <option key={r} value={r} className="text-black font-bold">
                    {r}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="sc-details" className="block text-lg sm:text-xl font-black text-black mb-2">
                Details &amp; Comments *
              </label>
              <textarea
                id="sc-details"
                rows={4}
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                placeholder="e.g. Event was rescheduled to Saturday at 2 PM, or store has moved to..."
                required
                className="w-full text-base sm:text-lg font-bold border-2 border-black rounded-2xl p-4 text-black placeholder:text-gray-500 focus:outline-none focus:ring-4 focus:ring-blue-500 leading-relaxed"
              />
              <span className="block text-sm sm:text-base font-bold text-black text-right mt-1.5">
                {details.length} / 1000 characters
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="sc-name" className="block text-base sm:text-lg font-black text-black mb-2">
                  Your Name <span className="font-bold text-gray-700">(optional)</span>
                </label>
                <input
                  type="text"
                  id="sc-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Anonymous"
                  className="w-full text-base sm:text-lg font-bold border-2 border-black rounded-2xl px-4 py-3.5 text-black placeholder:text-gray-500 focus:outline-none focus:ring-4 focus:ring-blue-500"
                />
              </div>
              <div>
                <label htmlFor="sc-email" className="block text-base sm:text-lg font-black text-black mb-2">
                  Your Email <span className="font-bold text-gray-700">(optional)</span>
                </label>
                <input
                  type="email"
                  id="sc-email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.ca"
                  className="w-full text-base sm:text-lg font-bold border-2 border-black rounded-2xl px-4 py-3.5 text-black placeholder:text-gray-500 focus:outline-none focus:ring-4 focus:ring-blue-500"
                />
              </div>
            </div>

            {errorMsg && (
              <div className="flex items-center gap-3 p-4 bg-red-100 border-2 border-red-600 text-black rounded-2xl text-base font-bold">
                <AlertCircle className="w-6 h-6 shrink-0 text-red-600" />
                <span>{errorMsg}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-4 pt-3">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="px-6 py-3.5 text-base sm:text-lg font-black text-black hover:bg-gray-200 rounded-2xl transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex items-center gap-2 bg-[#00008b] hover:bg-blue-900 text-white text-base sm:text-lg font-black px-7 py-3.5 rounded-2xl shadow-xl transition disabled:opacity-50"
              >
                {isSubmitting ? (
                  <span>Sending...</span>
                ) : (
                  <>
                    <Send className="w-5 h-5 text-white" />
                    <span>Send Update</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

export function SomethingChangedButton({
  itemTitle,
  businessName,
  category,
  className
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          className ||
          'inline-flex items-center gap-2 text-xs font-bold text-gray-600 hover:text-black transition'
        }
        title="Report inaccurate dates, closed business, or changes to this listing"
      >
        <Flag className="w-4 h-4 text-red-600 fill-red-600 shrink-0" />
        <span>Something changed?</span>
      </button>

      <SomethingChangedModal
        isOpen={open}
        onClose={() => setOpen(false)}
        itemTitle={itemTitle}
        businessName={businessName}
        category={category}
      />
    </>
  );
}
