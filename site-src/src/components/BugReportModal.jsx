import React, { useState, useEffect } from "react";
import { supabase } from "../supabaseClient";

export default function BugReportModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [pageUrl, setPageUrl] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (typeof window !== "undefined") {
      setPageUrl(window.location.href);
    }
  }, [isOpen]);

  const charCount = message.length;
  const isValidLength = charCount >= 50 && charCount <= 500;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!isValidLength) {
      setErrorMsg("Message must be between 50 and 500 characters.");
      return;
    }

    setIsSubmitting(true);
    setErrorMsg("");

    const reportData = {
      name: name.trim(),
      email: email.trim(),
      page_url: pageUrl.trim(),
      message: message.trim(),
      recipient: "contact@welcomeeg.ca",
      created_at: new Date().toISOString(),
      status: "new"
    };

    // 1. Dispatch email directly to robert@welcomeeg.ca via server endpoint
    let delivered = false;
    try {
      const res = await fetch("/api/send_bug_report.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(reportData)
      });
      delivered = res.ok && (await res.json().catch(() => ({}))).success === true; // 200 alone is not enough
    } catch (apiErr) {
      console.warn("Bug report server API dispatch notice:", apiErr);
    }

    // 2. Try Supabase insert if table exists
    try {
      if (supabase) {
        const { error: insErr } = await supabase.from("bug_reports").insert([reportData]);
        if (!insErr) delivered = true;
      }
    } catch (err) {
      console.warn("Supabase bug report insert skipped:", err);
    }

    // 3. Local fallback storage
    try {
      const existing = JSON.parse(localStorage.getItem("wg_bug_reports") || "[]");
      existing.unshift(reportData);
      localStorage.setItem("wg_bug_reports", JSON.stringify(existing.slice(0, 50)));
    } catch (e) {}

    setIsSubmitting(false);
    if (!delivered) {
      setErrorMsg("Sorry, your report could not be sent. Please email contact@welcomeeg.ca instead.");
      return;
    }
    setSubmitted(true);
    setTimeout(() => {
      setSubmitted(false);
      setIsOpen(false);
      setMessage("");
      setName("");
      setEmail("");
    }, 3500);
  };

  return (
    <>
      {/* Floating Button on Lower Left Side (Desktop & Tablet & Mobile Safe) */}
      {/* --wg-bottom-bar is set by pages with a fixed mobile tab bar (Home) so the button sits above it */}
      <div className="fixed bottom-[calc(var(--wg-bottom-bar,0px)+0.75rem)] left-3 sm:bottom-[calc(var(--wg-bottom-bar,0px)+1.5rem)] sm:left-6 z-50">
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="flex items-center gap-1.5 sm:gap-2.5 bg-slate-900/95 hover:bg-rose-700 text-white px-3 py-2 sm:px-4 sm:py-2.5 rounded-full shadow-2xl border-2 border-rose-500/80 font-black text-[11px] sm:text-xs uppercase tracking-wider transition-all duration-200 hover:scale-105 active:scale-95 group focus:outline-none focus:ring-4 focus:ring-rose-500/40"
          title="Report an issue or bug with the website or newsletter"
        >
          <span className="text-base group-hover:rotate-12 transition-transform">🐞</span>
          <span className="font-extrabold">Bug Reports</span>
        </button>
      </div>

      {/* Modal Backdrop & Form */}
      {isOpen && (
        <div className="fixed inset-0 z-[9999] flex items-start justify-center overflow-y-auto bg-slate-950/75 pt-6 pb-8 px-4 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white w-full max-w-lg rounded-2xl border-2 border-slate-900 shadow-2xl p-6 md:p-8 relative max-h-[90vh] overflow-y-auto">
            {/* Close Button */}
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="absolute top-5 right-5 text-slate-400 hover:text-slate-700 text-2xl font-bold leading-none p-1"
              aria-label="Close"
            >
              &times;
            </button>

            {submitted ? (
              <div className="text-center py-8 space-y-3">
                <span className="text-5xl block animate-bounce">✅</span>
                <h3 className="text-2xl font-black text-slate-900">Bug Report Dispatched</h3>
                <p className="text-sm text-slate-600 max-w-sm mx-auto leading-relaxed">
                  Thank you! Your report has been delivered to{" "}
                  <strong className="text-blue-900">robert@welcomeeg.ca</strong>. Our technical team is reviewing it right away.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="border-b border-slate-100 pb-3">
                  <div className="inline-flex items-center gap-1.5 bg-rose-100 text-rose-800 text-[11px] font-black uppercase px-2.5 py-0.5 rounded">
                    <span>🐞 Direct Issue Feedback</span>
                  </div>
                  <h3 className="text-xl font-black text-slate-900 mt-2">Report a Website or Newsletter Bug</h3>
                  <p className="text-xs text-slate-500 mt-1">
                    Notice something broken, a wrong date, or display bug? Messages are routed directly to{" "}
                    <strong className="text-slate-700">robert@welcomeeg.ca</strong>.
                  </p>
                </div>

                {errorMsg && (
                  <div className="bg-rose-50 border border-rose-300 text-rose-800 text-xs font-bold p-3 rounded-lg">
                    {errorMsg}
                  </div>
                )}

                {/* Submitter Name */}
                <div>
                  <label className="block text-xs font-black text-slate-700 uppercase tracking-wider mb-1">
                    Your Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Jane Doe"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white"
                  />
                </div>

                {/* Submitter Email */}
                <div>
                  <label className="block text-xs font-black text-slate-700 uppercase tracking-wider mb-1">
                    Your Email Address *
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="e.g. jane@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white"
                  />
                </div>

                {/* Page URL */}
                <div>
                  <label className="block text-xs font-black text-slate-700 uppercase tracking-wider mb-1">
                    Page URL Where Error Occurred *
                  </label>
                  <input
                    type="url"
                    required
                    value={pageUrl}
                    onChange={(e) => setPageUrl(e.target.value)}
                    className="w-full px-3.5 py-2 text-xs bg-slate-100 border border-slate-300 rounded-lg font-mono text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white"
                  />
                </div>

                {/* Bug Message */}
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-xs font-black text-slate-700 uppercase tracking-wider">
                      Bug Details &amp; Description *
                    </label>
                    <span
                      className={`text-[11px] font-mono font-bold ${
                        charCount < 50
                          ? "text-rose-600"
                          : charCount > 500
                          ? "text-rose-600"
                          : "text-emerald-700"
                      }`}
                    >
                      {charCount} / 500 chars {charCount < 50 ? "(min 50 required)" : "✓"}
                    </span>
                  </div>
                  <textarea
                    rows={4}
                    required
                    minLength={50}
                    maxLength={500}
                    placeholder="Please explain what went wrong, what button or link was clicked, or what incorrect text you noticed (minimum 50 characters)..."
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    className={`w-full p-3 text-sm rounded-lg border focus:outline-none focus:ring-2 focus:bg-white ${
                      charCount > 0 && charCount < 50
                        ? "border-rose-300 bg-rose-50/30 focus:ring-rose-500"
                        : "border-slate-300 bg-slate-50 focus:ring-blue-600"
                    }`}
                  />
                </div>

                {/* Action Buttons */}
                <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setIsOpen(false)}
                    className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={!isValidLength || isSubmitting}
                    className="px-6 py-2 text-xs font-black uppercase tracking-wider bg-rose-600 hover:bg-rose-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white rounded-lg shadow transition-colors flex items-center gap-2"
                  >
                    {isSubmitting ? "Submitting..." : "Send Bug Report →"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
