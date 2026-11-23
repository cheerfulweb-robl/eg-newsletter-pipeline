import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, Send, CheckCircle2, AlertCircle, User, MessageSquare } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { subscribeReader } from '../services/newsletter';
import AgreementCheckboxes from '../components/AgreementCheckboxes';

export default function Contact() {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [topic, setTopic] = useState('General Inquiry');
  const [message, setMessage] = useState('');
  const [websiteHp, setWebsiteHp] = useState(''); // honeypot
  const [joinNewsletter, setJoinNewsletter] = useState(false);
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [agreePrivacy, setAgreePrivacy] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  useEffect(() => {
    document.title = 'Contact Us | Welcome East Gwillimbury';
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const cleanFirst = firstName.trim();
    const cleanLast = lastName.trim();
    const cleanName = [cleanFirst, cleanLast].filter(Boolean).join(' ');
    const cleanEmail = email.trim().toLowerCase();
    const cleanMessage = message.trim();

    if (cleanFirst.length < 1 || cleanLast.length < 1) {
      setError('Please enter your first and last name.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setError('Please enter a valid email address.');
      return;
    }
    if (cleanMessage.length < 10) {
      setError('Please enter a message (at least 10 characters).');
      return;
    }
    if (!agreeTerms || !agreePrivacy) {
      setError('Please agree to both the Terms of Service and Privacy Policy.');
      return;
    }

    if (websiteHp.trim()) {
      setSent(true);
      return;
    }

    setSubmitting(true);
    try {
      const fullMessage = `[Topic: ${topic}]\n\n${cleanMessage}`;
      let delivered = false;

      try {
        const res = await fetch('/api/send_bug_report.php', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            report_type: 'contact_us',
            name: cleanName,
            email: cleanEmail,
            page_url: typeof window !== 'undefined' ? window.location.href : 'https://welcomeeg.ca/contact',
            listing_info: topic,
            message: fullMessage,
            website: websiteHp,
          }),
        });
        const json = await res.json().catch(() => ({}));
        if (res.ok && json.success) delivered = true;
      } catch (_) {}

      if (supabase) {
        const { error: dbErr } = await supabase.from('bug_reports').insert([{
          name: cleanName,
          email: cleanEmail,
          page_url: typeof window !== 'undefined' ? window.location.href : 'https://welcomeeg.ca/contact',
          message: `[Contact Us: ${topic}] ${cleanMessage}`,
          recipient: 'contact@welcomeeg.ca',
          created_at: new Date().toISOString(),
          status: 'contact_us',
        }]);
        if (!dbErr) delivered = true;
      }

      if (!delivered) {
        throw new Error('Could not send your message right now. Please try again shortly.');
      }

      if (joinNewsletter) {
        try {
          await subscribeReader({
            email: cleanEmail,
            firstName: cleanFirst,
            lastName: cleanLast,
            area: 'East Gwillimbury',
          });
        } catch (subErr) {
          console.warn('Contact newsletter signup notice:', subErr);
        }
      }

      setSent(true);
      if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setError(err?.message || 'Unable to send your message. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-[1440px] w-full mx-auto px-4 md:px-8 lg:px-12 py-8">
      {/* Design B East Gwillimbury Atmospheric Sunset Hero */}
      <div className="relative rounded-3xl overflow-hidden bg-gradient-to-br from-lake-950 via-lake-800 to-indigo-950 text-white p-8 sm:p-10 md:p-14 shadow-lift border border-lake-700/50 mb-8">
        <div className="absolute right-0 top-0 w-96 h-96 bg-sun-400/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute left-1/3 -bottom-10 w-80 h-80 bg-coral-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 max-w-3xl">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-lake-900/80 border border-lake-600/70 text-sun-200 text-xs sm:text-sm font-bold mb-4 shadow-sm backdrop-blur-sm">
            <Mail className="w-4 h-4 text-sun-300" aria-hidden="true" />
            <span>Welcome East Gwillimbury &bull; Direct Contact</span>
          </div>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tight font-display text-white leading-[1.1] mb-3">
            Contact Us
          </h1>
          <p className="text-blue-100 text-sm sm:text-base md:text-lg font-medium leading-relaxed max-w-2xl">
            Questions about local listings, community events, the Welcome Hamper, or advertising across East Gwillimbury? Send our team a message below.
          </p>
        </div>
      </div>

      {sent ? (
        <div className="max-w-2xl mx-auto bg-white rounded-3xl border border-emerald-200 shadow-sm p-8 sm:p-10 text-center space-y-4">
          <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-black text-gray-900 font-display">Message Sent</h2>
          <p className="text-sm text-gray-600 leading-relaxed">
            Thank you, <strong>{firstName}</strong>. We have received your message and will reply to <strong>{email}</strong> shortly.
            {joinNewsletter && ' We also registered your email for the Monday and Thursday Welcome East Gwillimbury newsletters.'}
          </p>
          <div className="pt-2 flex flex-wrap justify-center gap-3">
            <Link
              to="/"
              className="px-6 py-3 rounded-full bg-lake-800 hover:bg-lake-700 text-white text-xs font-black uppercase tracking-wider transition-colors"
            >
              Return Home
            </Link>
            <button
              type="button"
              onClick={() => {
                setSent(false);
                setMessage('');
                setError('');
              }}
              className="px-6 py-3 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-800 text-xs font-black uppercase tracking-wider transition-colors"
            >
              Send Another Message
            </button>
          </div>
        </div>
      ) : (
        <div className="max-w-2xl mx-auto bg-white rounded-3xl border border-gray-200 shadow-sm p-6 sm:p-8 md:p-10">
          <form onSubmit={handleSubmit} className="space-y-5" noValidate>
            <input
              type="text"
              name="website"
              value={websiteHp}
              onChange={(e) => setWebsiteHp(e.target.value)}
              tabIndex={-1}
              autoComplete="off"
              className="hidden"
              aria-hidden="true"
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="contact-first" className="block text-xs font-black uppercase tracking-wider text-gray-700 mb-1.5">
                  First Name <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-gray-400 absolute left-3.5 top-3.5 pointer-events-none" />
                  <input
                    id="contact-first"
                    type="text"
                    required
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="First name"
                    className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-300 text-sm font-semibold text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#00008b]"
                  />
                </div>
              </div>
              <div>
                <label htmlFor="contact-last" className="block text-xs font-black uppercase tracking-wider text-gray-700 mb-1.5">
                  Last Name <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-gray-400 absolute left-3.5 top-3.5 pointer-events-none" />
                  <input
                    id="contact-last"
                    type="text"
                    required
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Last name"
                    className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-300 text-sm font-semibold text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#00008b]"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="contact-email" className="block text-xs font-black uppercase tracking-wider text-gray-700 mb-1.5">
                  Email Address <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-gray-400 absolute left-3.5 top-3.5 pointer-events-none" />
                  <input
                    id="contact-email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.ca"
                    className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-300 text-sm font-semibold text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#00008b]"
                  />
                </div>
              </div>
              <div>
                <label htmlFor="contact-topic" className="block text-xs font-black uppercase tracking-wider text-gray-700 mb-1.5">
                  Topic
                </label>
                <select
                  id="contact-topic"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-gray-300 text-sm font-semibold text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-[#00008b]"
                >
                  <option value="General Inquiry">General Inquiry</option>
                  <option value="Business Listing / Directory">Business Listing / Directory</option>
                  <option value="Events, Dining & Sales">Events, Dining &amp; Sales</option>
                  <option value="Welcome Hamper">Welcome Hamper</option>
                  <option value="Advertising & Sponsorships">Advertising &amp; Sponsorships</option>
                  <option value="Press / Media">Press / Media</option>
                </select>
              </div>
            </div>

            <div>
              <label htmlFor="contact-message" className="block text-xs font-black uppercase tracking-wider text-gray-700 mb-1.5">
                Message <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <MessageSquare className="w-4 h-4 text-gray-400 absolute left-3.5 top-3.5 pointer-events-none" />
                <textarea
                  id="contact-message"
                  rows={5}
                  required
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="How can we help?"
                  className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-300 text-sm font-semibold text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#00008b]"
                />
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-blue-50/70 border border-blue-200/80">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={joinNewsletter}
                  onChange={(e) => setJoinNewsletter(e.target.checked)}
                  className="mt-0.5 w-5 h-5 shrink-0 rounded border-gray-300 text-[#00008b] focus:ring-[#00008b]"
                />
                <span className="text-xs text-gray-700 leading-relaxed">
                  <strong className="text-[#00008b] block mb-0.5">Sign up for the Welcome East Gwillimbury Newsletters (Optional)</strong>
                  Receive both our Monday edition (weekday events &amp; specials) and Thursday edition (weekend guide). You can unsubscribe anytime.
                </span>
              </label>
            </div>

            <AgreementCheckboxes
              agreePrivacy={agreePrivacy}
              setAgreePrivacy={setAgreePrivacy}
              agreeTerms={agreeTerms}
              setAgreeTerms={setAgreeTerms}
              disabled={submitting}
            />

            {error && (
              <div className="p-4 rounded-xl bg-[#dc2626] border border-[#b91c1c] text-white text-xs font-bold flex items-start gap-2.5" role="alert">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full min-h-[48px] px-6 py-3.5 rounded-full bg-coral-600 hover:bg-coral-700 disabled:opacity-50 text-white font-black text-xs sm:text-sm uppercase tracking-wider shadow-pop-sm transition-colors inline-flex items-center justify-center gap-2 cursor-pointer"
            >
              <Send className="w-4 h-4" />
              <span>{submitting ? 'Sending...' : 'Send Message'}</span>
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
