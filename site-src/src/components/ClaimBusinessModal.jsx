import React, { useEffect, useState } from 'react';
import { X, ShieldCheck, CheckCircle2, AlertCircle, Upload, Phone, Globe } from 'lucide-react';
import { supabase } from '../supabaseClient';

function extractHost(url) {
  const u = String(url || '').trim();
  if (!/^https?:\/\//i.test(u)) return '';
  try {
    const host = new URL(u).hostname.replace(/^www\./i, '').toLowerCase();
    return host.includes('welcomeeg.ca') ? '' : host;
  } catch (_) {
    return '';
  }
}

export default function ClaimBusinessModal({ business, isOpen, alreadyClaimed = false, onClose }) {
  const [name, setName] = useState('');
  const [role, setRole] = useState('Owner');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [method, setMethod] = useState('phone_call');
  const [notes, setNotes] = useState('');
  const [proofFile, setProofFile] = useState(null);
  const [websiteHp, setWebsiteHp] = useState('');
  const [agree, setAgree] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const bizHost = extractHost(business?.link);
  const emailDomain = email.includes('@') ? email.split('@')[1].trim().toLowerCase() : '';
  const domainMatches = Boolean(bizHost && emailDomain && (emailDomain === bizHost || emailDomain.endsWith('.' + bizHost)));

  useEffect(() => {
    if (!isOpen) return undefined;
    setError('');
    setDone(false);
    setProofFile(null);
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, business?.id, onClose]);

  useEffect(() => {
    if (domainMatches) setMethod('domain_email');
  }, [domainMatches]);

  if (!isOpen || !business) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const cleanName = name.trim();
    const cleanEmail = email.trim().toLowerCase();
    const cleanPhone = phone.trim();

    if (cleanName.length < 2) { setError('Please enter your full name.'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) { setError('Please enter a valid email address.'); return; }
    if (!domainMatches && method === 'phone_call' && !business.phone && cleanPhone.length < 7) {
      setError('Please enter your contact phone number.');
      return;
    }
    if (method === 'document_upload' && !proofFile) {
      setError('Please select a verification document (business license, utility bill, or storefront photo).');
      return;
    }
    if (!agree) { setError('Please confirm you are authorized to represent this business.'); return; }
    if (websiteHp.trim()) { setDone(true); return; }

    setSubmitting(true);
    try {
      let proofPath = null;
      if (method === 'document_upload' && proofFile) {
        if (proofFile.size > 5 * 1024 * 1024) {
          throw new Error('Verification document must be 5 MB or smaller.');
        }
        const ALLOWED_MIME = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);
        const ALLOWED_EXT = new Set(['pdf', 'jpg', 'jpeg', 'png', 'webp']);
        const ext = (proofFile.name.split('.').pop() || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        if (!ALLOWED_EXT.has(ext) || (proofFile.type && !ALLOWED_MIME.has(proofFile.type))) {
          throw new Error('Please upload a PDF, JPG, PNG, or WebP file.');
        }
        const path = `claims/${business.id}/${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage.from('claim-proofs').upload(path, proofFile, {
          contentType: proofFile.type || (ext === 'pdf' ? 'application/pdf' : `image/${ext === 'jpg' ? 'jpeg' : ext}`),
          upsert: false,
        });
        if (upErr) throw new Error('Could not upload verification document: ' + upErr.message);
        proofPath = path;
      }

      const { data, error: rpcErr } = await supabase.rpc('wg_submit_business_claim', {
        p: {
          business_id: business.id,
          claimant_name: cleanName,
          claimant_role: role,
          claimant_email: cleanEmail,
          claimant_phone: cleanPhone,
          verification_method: domainMatches ? 'domain_email' : method,
          proof_path: proofPath,
          notes: notes.trim(),
        },
      });
      if (rpcErr || !data || !data.success) {
        throw new Error(rpcErr?.message || (data && data.error) || 'Could not submit claim.');
      }

      try {
        await supabase.functions.invoke('send-email', {
          body: { formType: 'business_claim_verify', record: { id: data.id, email: cleanEmail } },
        });
      } catch (mailErr) {
        console.warn('Claim verification email notice:', mailErr);
      }

      setDone(true);
    } catch (err) {
      setError(err?.message || 'Unable to submit your claim right now.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[10001] bg-black/60 backdrop-blur-xs flex items-start justify-center overflow-y-auto pt-6 pb-8 px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="claim-biz-title"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-3xl border border-gray-200 shadow-2xl w-full max-w-lg p-6 sm:p-8 text-left space-y-5">
        <div className="flex items-start justify-between gap-3 border-b border-gray-100 pb-4">
          <div className="min-w-0">
            <p className="text-[11px] font-black uppercase tracking-wider text-lake-800 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>{alreadyClaimed ? 'Ownership / Manager Request' : 'Claim This Business'}</span>
            </p>
            <h2 id="claim-biz-title" className="text-xl font-black text-gray-900 mt-1 break-words">{business.name}</h2>
            {(business.location || business.community) && (
              <p className="text-xs text-gray-500 mt-0.5">{[business.location, business.community].filter(Boolean).join(' • ')}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-2 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-600 shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {done ? (
          <div className="py-4 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-7 h-7" />
            </div>
            <h3 className="text-lg font-black text-gray-900">Check Your Email to Confirm</h3>
            <p className="text-xs text-gray-600 leading-relaxed">
              We sent a 1-time confirmation link to <strong>{email}</strong>. Your claim will enter our verification queue as soon as you click that link. An admin will review and approve your access before anything changes.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mt-2 px-6 py-2.5 rounded-full bg-lake-800 hover:bg-lake-700 text-white text-xs font-black uppercase tracking-wider"
            >
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {alreadyClaimed && (
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 font-semibold">
                This business already has a verified account. Submitting this form creates a manual co-manager / ownership transfer review for our admins.
              </div>
            )}

            <input
              type="text"
              value={websiteHp}
              onChange={(e) => setWebsiteHp(e.target.value)}
              tabIndex={-1}
              autoComplete="off"
              className="hidden"
              aria-hidden="true"
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="claim-name" className="block text-xs font-black uppercase tracking-wider text-gray-700 mb-1">Full Name *</label>
                <input id="claim-name" type="text" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 text-sm font-semibold" />
              </div>
              <div>
                <label htmlFor="claim-role" className="block text-xs font-black uppercase tracking-wider text-gray-700 mb-1">Your Role *</label>
                <select id="claim-role" value={role} onChange={(e) => setRole(e.target.value)} className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 text-sm font-semibold bg-white">
                  <option value="Owner">Owner</option>
                  <option value="General Manager">General Manager</option>
                  <option value="Marketing / Authorized Rep">Marketing / Authorized Rep</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="claim-email" className="block text-xs font-black uppercase tracking-wider text-gray-700 mb-1">Business Email *</label>
                <input id="claim-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder={bizHost ? `you@${bizHost}` : 'you@business.ca'} className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 text-sm font-semibold" />
                {domainMatches && (
                  <p className="text-[11px] font-bold text-emerald-700 mt-1 flex items-center gap-1">
                    <Globe className="w-3.5 h-3.5" /> Matches {bizHost} domain
                  </p>
                )}
              </div>
              <div>
                <label htmlFor="claim-phone" className="block text-xs font-black uppercase tracking-wider text-gray-700 mb-1">Phone Number</label>
                <input id="claim-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(905) 555-0123" className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 text-sm font-semibold" />
              </div>
            </div>

            {!domainMatches && (
              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-2.5">
                <p className="text-xs font-black uppercase tracking-wider text-gray-700">Verification Method *</p>
                <label className="flex items-start gap-2.5 text-xs text-gray-700 cursor-pointer">
                  <input type="radio" name="claim-method" value="phone_call" checked={method === 'phone_call'} onChange={() => setMethod('phone_call')} className="mt-0.5" />
                  <span>
                    <strong className="inline-flex items-center gap-1 text-gray-900"><Phone className="w-3.5 h-3.5 text-lake-800" /> Phone Callback Verification</strong>
                    <span className="block text-[11px] text-gray-500">
                      {business.phone ? `Our team will confirm by calling the published number (${business.phone}).` : 'Our team will verify your business phone number.'}
                    </span>
                  </span>
                </label>
                <label className="flex items-start gap-2.5 text-xs text-gray-700 cursor-pointer">
                  <input type="radio" name="claim-method" value="document_upload" checked={method === 'document_upload'} onChange={() => setMethod('document_upload')} className="mt-0.5" />
                  <span>
                    <strong className="inline-flex items-center gap-1 text-gray-900"><Upload className="w-3.5 h-3.5 text-lake-800" /> Upload Proof Document</strong>
                    <span className="block text-[11px] text-gray-500">Business license, HST registration, utility bill, or storefront photo (private, admins only).</span>
                  </span>
                </label>
                {method === 'document_upload' && (
                  <input
                    type="file"
                    accept="image/*,.pdf"
                    onChange={(e) => setProofFile(e.target.files?.[0] || null)}
                    className="w-full text-xs text-gray-700 pt-1"
                  />
                )}
              </div>
            )}

            <div>
              <label htmlFor="claim-notes" className="block text-xs font-black uppercase tracking-wider text-gray-700 mb-1">Additional Notes (Optional)</label>
              <textarea id="claim-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Best time to call or any details to help verify ownership..." className="w-full px-3.5 py-2 rounded-xl border border-gray-300 text-sm" />
            </div>

            <label className="flex items-start gap-2.5 text-xs text-gray-700 cursor-pointer">
              <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5 w-4 h-4 rounded" />
              <span>I confirm that I am an authorized representative of <strong>{business.name}</strong> and understand an admin must approve this claim before access is granted.</span>
            </label>

            {error && (
              <div className="p-3 rounded-xl bg-rose-600 text-white text-xs font-bold flex items-start gap-2" role="alert">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
              <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold">Cancel</button>
              <button type="submit" disabled={submitting} className="px-6 py-2.5 rounded-full bg-lake-800 hover:bg-coral-600 disabled:opacity-50 text-white text-xs font-black uppercase tracking-wider transition-colors">
                {submitting ? 'Submitting...' : 'Submit Claim'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
