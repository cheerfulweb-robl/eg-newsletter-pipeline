import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  MessageSquare,
  X,
  Send,
  RotateCcw,
  Calendar,
  MapPin,
  Tag,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Mail,
} from 'lucide-react';
import { supabase } from '../supabaseClient';

const QUICK_ACTIONS = [
  'Weekend events',
  'Local deals',
  'Where to eat',
  'New to East Gwillimbury',
  'Promote my business',
];

const INITIAL_MESSAGE = {
  id: 'welcome',
  role: 'assistant',
  text: 'Hi! I am Ask WEG. Ask me about upcoming East Gwillimbury events, dining, local deals, businesses, or the Welcome Hamper — no account needed.',
  results: [],
  followUps: QUICK_ACTIONS,
  suggestLeadType: null,
};

function safeInternalPath(url) {
  const s = String(url || '').trim();
  if (/^\/[^/]/.test(s) || s === '/') return s;
  return null;
}

const STATIC_PORTAL_PATHS = /^\/(?:hamper|news|staff|business)(?:\/|$)/i;

function renderInlineFormatted(line, onNavigate, keyPrefix) {
  // Tokenize [label](url), bare internal paths (/dining, /events, etc.), and **bold**
  const tokenRe = /(\[[^\]]+\]\((?:\/[^)\s]+|https?:\/\/[^)\s]+)\)|\*\*[^*]+\*\*|(?:^|(?<=\s))\/(?:events|dining|sales|offers|directory|businesses|hamper\/?|newsroom|press|advertise|subscribe|contact|this-weekend|spotlight|weather|knowledge-base)(?:\/[a-z0-9_-]+)*(?=[.,!?;:\s)]|$))/gi;
  const parts = [];
  let lastIdx = 0;
  let match;
  let idx = 0;
  while ((match = tokenRe.exec(line)) !== null) {
    if (match.index > lastIdx) {
      parts.push(line.slice(lastIdx, match.index));
    }
    const tok = match[0];
    const k = `${keyPrefix}-${idx++}`;
    if (tok.startsWith('**') && tok.endsWith('**')) {
      parts.push(<strong key={k} className="font-bold text-gray-900">{tok.slice(2, -2)}</strong>);
    } else if (tok.startsWith('[')) {
      const m = tok.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (m) {
        const label = m[1];
        const rawHref = m[2].trim();
        const href = rawHref.replace(/^https?:\/\/(?:www\.)?welcomeeg\.ca(?=\/|$)/i, '') || '/';
        const internal = safeInternalPath(href);
        if (internal && !STATIC_PORTAL_PATHS.test(internal)) {
          parts.push(
            <Link key={k} to={internal} onClick={onNavigate} className="font-bold text-[#00008b] underline hover:text-blue-900">
              {label}
            </Link>
          );
        } else if (internal) {
          parts.push(
            <a key={k} href={internal} onClick={onNavigate} className="font-bold text-[#00008b] underline hover:text-blue-900">
              {label}
            </a>
          );
        } else if (/^https?:\/\//i.test(href)) {
          parts.push(
            <a key={k} href={href} target="_blank" rel="noopener noreferrer" className="font-bold text-[#00008b] underline hover:text-blue-900">
              {label}
            </a>
          );
        } else {
          parts.push(label);
        }
      }
    } else if (tok.startsWith('/')) {
      if (STATIC_PORTAL_PATHS.test(tok)) {
        parts.push(
          <a key={k} href={tok} onClick={onNavigate} className="font-bold text-[#00008b] underline hover:text-blue-900">
            {tok}
          </a>
        );
      } else {
        parts.push(
          <Link key={k} to={tok} onClick={onNavigate} className="font-bold text-[#00008b] underline hover:text-blue-900">
            {tok}
          </Link>
        );
      }
    }
    lastIdx = match.index + tok.length;
  }
  if (lastIdx < line.length) {
    parts.push(line.slice(lastIdx));
  }
  return parts;
}

function renderSafeChatText(rawText, onNavigate) {
  const lines = String(rawText || '').split(/\r?\n/);
  return (
    <div className="space-y-1.5">
      {lines.map((rawLine, i) => {
        const line = rawLine.trim();
        if (!line) return null;
        const headingMatch = line.match(/^#{1,4}\s+(.+)$/);
        if (headingMatch) {
          return (
            <p key={i} className="font-black text-gray-900 text-sm pt-0.5">
              {renderInlineFormatted(headingMatch[1], onNavigate, `h-${i}`)}
            </p>
          );
        }
        const bulletMatch = line.match(/^[-*•]\s+(.+)$/);
        if (bulletMatch) {
          return (
            <div key={i} className="flex items-start gap-1.5 pl-1">
              <span className="text-[#00008b] font-black mt-0.5">&bull;</span>
              <span>{renderInlineFormatted(bulletMatch[1], onNavigate, `b-${i}`)}</span>
            </div>
          );
        }
        return <p key={i}>{renderInlineFormatted(line, onNavigate, `p-${i}`)}</p>;
      })}
    </div>
  );
}

function TypewriterText({ text, animate, onDone, onNavigate }) {
  const reducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const shouldAnimate = animate && !reducedMotion;
  const [shownLen, setShownLen] = useState(shouldAnimate ? 0 : text.length);

  useEffect(() => {
    if (!shouldAnimate) {
      setShownLen(text.length);
      onDone?.();
      return;
    }
    setShownLen(0);
    let idx = 0;
    const timer = setInterval(() => {
      idx += 1;
      setShownLen(idx);
      if (idx >= text.length) {
        clearInterval(timer);
        onDone?.();
      }
    }, 14);
    return () => clearInterval(timer);
  }, [text, shouldAnimate]);

  return renderSafeChatText(text.slice(0, shownLen), onNavigate);
}

function ScrollRevealCard({ rootRef, children }) {
  const cardRef = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = cardRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          obs.disconnect();
        }
      },
      { root: rootRef?.current || null, threshold: 0.1 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [rootRef]);

  return (
    <div
      ref={cardRef}
      className={`transition-all duration-300 motion-reduce:transition-none ${
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
      }`}
    >
      {children}
    </div>
  );
}

export default function AskWgWidget() {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([INITIAL_MESSAGE]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);

  // Optional consented lead form
  const [showLeadForm, setShowLeadForm] = useState(false);
  const [leadType, setLeadType] = useState('general');
  const [leadName, setLeadName] = useState('');
  const [leadEmail, setLeadEmail] = useState('');
  const [leadPhone, setLeadPhone] = useState('');
  const [leadBusiness, setLeadBusiness] = useState('');
  const [leadMessage, setLeadMessage] = useState('');
  const [consentContact, setConsentContact] = useState(false);
  const [newsletterOptIn, setNewsletterOptIn] = useState(false);
  const [websiteTrap, setWebsiteTrap] = useState('');
  const [leadBusy, setLeadBusy] = useState(false);
  const [leadError, setLeadError] = useState('');
  const [leadSuccess, setLeadSuccess] = useState(false);

  const launcherRef = useRef(null);
  const inputRef = useRef(null);
  const scrollRef = useRef(null);
  const latestBotRef = useRef(null);
  const [typedDoneIds, setTypedDoneIds] = useState(() => new Set(['welcome']));
  const makeSessionKey = () =>
    (typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `wg-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`);
  const sessionKeyRef = useRef(makeSessionKey());

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 40);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setOpen(false);
        launcherRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  useEffect(() => {
    const last = messages[messages.length - 1];
    if (showLeadForm || busy || last?.role === 'user') {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
      return;
    }
    if (last?.role === 'assistant' && last.id !== 'welcome') {
      latestBotRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }
  }, [messages, showLeadForm, busy]);

  function resetChat() {
    sessionKeyRef.current = makeSessionKey();
    setMessages([INITIAL_MESSAGE]);
    setInput('');
    setShowLeadForm(false);
    setLeadError('');
    setLeadSuccess(false);
  }

  async function sendQuestion(rawText) {
    const text = String(rawText || '').trim();
    if (text.length < 2 || busy) return;

    const userMsg = { id: `u-${Date.now()}`, role: 'user', text };
    const history = messages
      .filter((m) => m.id !== 'welcome')
      .slice(-6)
      .map((m) => ({ role: m.role, content: m.text }));

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setBusy(true);

    try {
      const { data, error } = await supabase.functions.invoke('discovery-chat', {
        body: {
          message: text,
          session_key: sessionKeyRef.current,
          history,
          context: { page_url: location.pathname },
        },
      });
      if (error || !data || !data.answer) {
        throw new Error(error?.message || 'Discovery unavailable');
      }
      const botMsg = {
        id: `a-${Date.now()}`,
        role: 'assistant',
        text: data.answer,
        results: Array.isArray(data.results) ? data.results : [],
        followUps: Array.isArray(data.follow_up_questions) ? data.follow_up_questions : [],
        suggestLeadType: data.suggest_lead_type || null,
      };
      setMessages((prev) => [...prev, botMsg]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: `e-${Date.now()}`,
          role: 'assistant',
          text: 'Ask WEG is temporarily unavailable. You can browse live listings on /events, /dining, /sales, or /directory, or send us an inquiry below.',
          results: [],
          followUps: ['Weekend events', 'Local deals'],
          suggestLeadType: 'general',
        },
      ]);
    } finally {
      setBusy(false);
    }
  }

  async function submitLead(e) {
    e.preventDefault();
    setLeadError('');
    setLeadSuccess(false);
    if (!consentContact) {
      setLeadError('Please check the consent box so our team can reply to you.');
      return;
    }
    setLeadBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke('discovery-lead', {
        body: {
          lead_type: leadType,
          name: leadName.trim(),
          email: leadEmail.trim(),
          phone: leadPhone.trim(),
          business_name: leadBusiness.trim(),
          message: leadMessage.trim(),
          consent_to_contact: true,
          newsletter_opt_in: newsletterOptIn,
          source_page: location.pathname,
          session_key: sessionKeyRef.current,
          website_trap: websiteTrap,
        },
      });
      if (error || !data || !data.success) {
        throw new Error(data?.error || error?.message || 'Could not submit inquiry.');
      }
      setLeadSuccess(true);
      setLeadName('');
      setLeadEmail('');
      setLeadPhone('');
      setLeadBusiness('');
      setLeadMessage('');
      setConsentContact(false);
      setNewsletterOptIn(false);
    } catch (err) {
      setLeadError(err?.message || 'Could not submit inquiry. Please email contact@welcomeeg.ca.');
    } finally {
      setLeadBusy(false);
    }
  }

  return (
    <>
      {/* Floating Launcher */}
      {!open && (
        <button
          ref={launcherRef}
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open Ask WEG local discovery assistant"
          className="fixed bottom-20 right-4 lg:bottom-6 lg:right-6 z-40 inline-flex items-center gap-2 px-4 py-3 rounded-full bg-[#00008b] hover:bg-blue-900 text-white font-black text-sm shadow-lg border border-blue-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#00008b] transition-transform motion-reduce:transition-none hover:scale-[1.02]"
        >
          <MessageSquare className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>Ask WEG</span>
        </button>
      )}

      {/* Accessible Drawer */}
      {open && (
        <section
          role="dialog"
          aria-modal="true"
          aria-label="Ask WEG Local Discovery Assistant"
          className="fixed bottom-20 right-3 left-3 sm:left-auto sm:right-5 lg:bottom-6 lg:right-6 sm:w-[410px] max-h-[78vh] z-50 flex flex-col bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden"
        >
          {/* Header */}
          <header className="flex items-center justify-between px-4 py-3 bg-[#00008b] text-white shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <MessageSquare className="w-4 h-4 shrink-0" aria-hidden="true" />
              <div className="min-w-0">
                <h2 className="text-sm font-black leading-tight">Ask WEG</h2>
                <p className="text-[11px] text-blue-100 truncate">East Gwillimbury Events, Dining &amp; Local Deals</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={resetChat}
                aria-label="Restart conversation"
                title="Restart conversation"
                className="p-1.5 rounded-lg hover:bg-white/15 focus:outline-none focus:ring-2 focus:ring-white"
              >
                <RotateCcw className="w-4 h-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  launcherRef.current?.focus();
                }}
                aria-label="Close Ask WEG"
                className="p-1.5 rounded-lg hover:bg-white/15 focus:outline-none focus:ring-2 focus:ring-white"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
          </header>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-3.5 space-y-3 bg-slate-50">
            {messages.map((m, idx) => {
              const isLatestBot = m.role === 'assistant' && idx === messages.length - 1 && m.id !== 'welcome';
              const cardsReady = !isLatestBot || typedDoneIds.has(m.id);
              return (
              <div
                key={m.id}
                ref={isLatestBot ? latestBotRef : undefined}
                className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`max-w-[90%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                    m.role === 'user'
                      ? 'bg-[#00008b] text-white rounded-br-sm'
                      : 'bg-white text-gray-800 border border-gray-200 rounded-bl-sm shadow-sm'
                  }`}
                >
                  {isLatestBot ? (
                    <TypewriterText
                      text={m.text}
                      animate={!typedDoneIds.has(m.id)}
                      onNavigate={() => setOpen(false)}
                      onDone={() =>
                        setTypedDoneIds((prev) => {
                          if (prev.has(m.id)) return prev;
                          const next = new Set(prev);
                          next.add(m.id);
                          return next;
                        })
                      }
                    />
                  ) : (
                    renderSafeChatText(m.text, () => setOpen(false))
                  )}
                </div>

                {/* Grounded Result Cards (revealed on scroll after text types out) */}
                {cardsReady && m.results && m.results.length > 0 && (
                  <div className="w-full mt-2 space-y-2">
                    {m.results.map((r) => {
                      const internal = safeInternalPath(r.url);
                      return (
                        <ScrollRevealCard key={`${m.id}-${r.id}`} rootRef={scrollRef}>
                        <article
                          className="bg-white rounded-xl border border-gray-200 p-3 shadow-sm text-xs space-y-1.5"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <h3 className="font-black text-gray-900 text-sm leading-snug">{r.title}</h3>
                            <span className="shrink-0 px-2 py-0.5 rounded-full bg-blue-50 text-[#00008b] font-bold uppercase text-[10px]">
                              {r.type}
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-x-3 gap-y-1 text-gray-600">
                            {(r.date_label || r.start_at) && (
                              <span className="inline-flex items-center gap-1">
                                <Calendar className="w-3 h-3 shrink-0" aria-hidden="true" />
                                {r.date_label || r.start_at}
                              </span>
                            )}
                            {r.community && (
                              <span className="inline-flex items-center gap-1">
                                <MapPin className="w-3 h-3 shrink-0" aria-hidden="true" />
                                {r.community}
                              </span>
                            )}
                            {r.price_label && (
                              <span className="inline-flex items-center gap-1 font-semibold text-emerald-700">
                                <Tag className="w-3 h-3 shrink-0" aria-hidden="true" />
                                {r.price_label}
                              </span>
                            )}
                          </div>
                          <div className="pt-1 flex items-center gap-3">
                            {internal ? (
                              <Link
                                to={internal}
                                onClick={() => setOpen(false)}
                                className="inline-flex items-center gap-1 font-extrabold text-[#00008b] hover:underline"
                              >
                                View details
                              </Link>
                            ) : (
                              <span className="text-gray-500">Listed on Welcome East Gwillimbury</span>
                            )}
                            {r.source_url && (
                              <a
                                href={r.source_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-gray-500 hover:text-gray-800 hover:underline"
                              >
                                Source <ExternalLink className="w-3 h-3" aria-hidden="true" />
                              </a>
                            )}
                          </div>
                        </article>
                        </ScrollRevealCard>
                      );
                    })}
                  </div>
                )}

                {/* Suggest Lead Form CTA */}
                {m.suggestLeadType && !showLeadForm && (
                  <button
                    type="button"
                    onClick={() => {
                      setLeadType(m.suggestLeadType);
                      setShowLeadForm(true);
                    }}
                    className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-900 border border-emerald-200 text-xs font-extrabold hover:bg-emerald-100"
                  >
                    <Mail className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Send an inquiry to our team</span>
                  </button>
                )}

                {/* Quick / Follow-up Pills */}
                {cardsReady && m.followUps && m.followUps.length > 0 && m.id === messages[messages.length - 1]?.id && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {m.followUps.map((q) => (
                      <button
                        key={q}
                        type="button"
                        onClick={() => sendQuestion(q)}
                        className="px-2.5 py-1 rounded-full bg-white border border-gray-300 text-xs font-semibold text-gray-700 hover:border-[#00008b] hover:text-[#00008b] focus:outline-none focus:ring-2 focus:ring-[#00008b]"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              );
            })}

            {busy && (
              <div className="text-xs font-semibold text-gray-500 px-2">Searching Welcome East Gwillimbury...</div>
            )}

            {/* Optional Consented Inquiry Form */}
            {showLeadForm && (
              <form onSubmit={submitLead} className="bg-white rounded-xl border border-gray-200 p-3.5 space-y-2.5 shadow-sm">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-black uppercase tracking-wider text-[#00008b]">
                    Send an Inquiry
                  </h3>
                  <button
                    type="button"
                    onClick={() => setShowLeadForm(false)}
                    className="text-xs text-gray-500 hover:text-gray-800 underline"
                  >
                    Hide
                  </button>
                </div>

                {leadSuccess && (
                  <div className="flex items-start gap-2 p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs">
                    <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
                    <span>Thanks! Your inquiry has been received by our team.</span>
                  </div>
                )}
                {leadError && (
                  <div className="flex items-start gap-2 p-2.5 rounded-lg bg-red-50 border border-red-200 text-red-800 text-xs">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
                    <span>{leadError}</span>
                  </div>
                )}

                <input
                  type="text"
                  tabIndex={-1}
                  autoComplete="off"
                  value={websiteTrap}
                  onChange={(e) => setWebsiteTrap(e.target.value)}
                  className="hidden"
                  aria-hidden="true"
                />

                <select
                  aria-label="Inquiry type"
                  value={leadType}
                  onChange={(e) => setLeadType(e.target.value)}
                  className="w-full px-2.5 py-2 rounded-lg border border-gray-300 text-xs"
                >
                  <option value="business">Promote my business</option>
                  <option value="sponsor">Sponsorship / Advertising</option>
                  <option value="hamper">Welcome Hamper question</option>
                  <option value="resident">Resident question</option>
                  <option value="general">General inquiry</option>
                </select>

                <input
                  type="text"
                  required
                  placeholder="Your name *"
                  aria-label="Your name"
                  value={leadName}
                  onChange={(e) => setLeadName(e.target.value)}
                  className="w-full px-2.5 py-2 rounded-lg border border-gray-300 text-xs"
                />
                <input
                  type="email"
                  required
                  placeholder="Email address *"
                  aria-label="Email address"
                  value={leadEmail}
                  onChange={(e) => setLeadEmail(e.target.value)}
                  className="w-full px-2.5 py-2 rounded-lg border border-gray-300 text-xs"
                />
                {(leadType === 'business' || leadType === 'sponsor') && (
                  <input
                    type="text"
                    placeholder="Business name (optional)"
                    aria-label="Business name"
                    value={leadBusiness}
                    onChange={(e) => setLeadBusiness(e.target.value)}
                    className="w-full px-2.5 py-2 rounded-lg border border-gray-300 text-xs"
                  />
                )}
                <input
                  type="tel"
                  placeholder="Phone (optional)"
                  aria-label="Phone"
                  value={leadPhone}
                  onChange={(e) => setLeadPhone(e.target.value)}
                  className="w-full px-2.5 py-2 rounded-lg border border-gray-300 text-xs"
                />
                <textarea
                  required
                  rows={2}
                  placeholder="How can we help? *"
                  aria-label="Message"
                  value={leadMessage}
                  onChange={(e) => setLeadMessage(e.target.value)}
                  className="w-full px-2.5 py-2 rounded-lg border border-gray-300 text-xs"
                />

                <label className="flex items-start gap-2 text-[11px] text-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    required
                    checked={consentContact}
                    onChange={(e) => setConsentContact(e.target.checked)}
                    className="mt-0.5"
                  />
                  <span>I consent to Welcome East Gwillimbury contacting me regarding this inquiry. *</span>
                </label>

                <label className="flex items-start gap-2 text-[11px] text-gray-600 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newsletterOptIn}
                    onChange={(e) => setNewsletterOptIn(e.target.checked)}
                    className="mt-0.5"
                  />
                  <span>Also request the twice-weekly newsletter (optional).</span>
                </label>

                <button
                  type="submit"
                  disabled={leadBusy}
                  className="w-full py-2 rounded-lg bg-[#00008b] hover:bg-blue-900 disabled:opacity-60 text-white text-xs font-black"
                >
                  {leadBusy ? 'Sending...' : 'Send Inquiry'}
                </button>
              </form>
            )}
          </div>

          {/* Footer Input */}
          <footer className="p-2.5 bg-white border-t border-gray-200 shrink-0">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                sendQuestion(input);
              }}
              className="flex items-center gap-2"
            >
              <input
                ref={inputRef}
                type="text"
                maxLength={400}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask about East Gwillimbury events, dining, deals..."
                aria-label="Ask WEG a question"
                className="flex-1 px-3 py-2 rounded-xl border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#00008b]"
              />
              <button
                type="submit"
                disabled={busy || input.trim().length < 2}
                aria-label="Send question"
                className="p-2.5 rounded-xl bg-[#00008b] hover:bg-blue-900 disabled:opacity-50 text-white focus:outline-none focus:ring-2 focus:ring-[#00008b]"
              >
                <Send className="w-4 h-4" aria-hidden="true" />
              </button>
            </form>
            <div className="mt-1.5 flex items-center justify-between text-[11px] text-gray-500 px-1">
              <span>Grounded in approved Welcome East Gwillimbury listings</span>
              <button
                type="button"
                onClick={() => setShowLeadForm((v) => !v)}
                className="font-bold text-[#00008b] hover:underline"
              >
                {showLeadForm ? 'Close form' : 'Contact us'}
              </button>
            </div>
          </footer>
        </section>
      )}
    </>
  );
}
