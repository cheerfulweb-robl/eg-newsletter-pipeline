import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../supabaseClient";

const FALLBACK_CORRECTIONS = [
  {
    id: "corr-base-1",
    title: "Salvation Army Christmas Sale Date Clarification",
    issue_date: "2026-11-05",
    edition_target: "both",
    status: "active",
    original_claim: "Previous listings referenced a November 13 expiration date for the Salvation Army Christmas Sale.",
    correction_text: "The Christmas Sale at the Salvation Army East Gwillimbury Community Church takes place on Saturday, November 14, 2026 from 9:00 AM to 2:00 PM at 1816 Metro Rd. N. in Sharon. Admission is free, featuring baked goods, holiday gifts, clothing, and seasonal decor.",
    action_taken: "Updated across website sales directory, events calendar, and newsletter listings."
  },
  {
    id: "corr-base-2",
    title: "Mount Albert Legion Branch 356 Schedule & Listing Adjustments",
    issue_date: "2026-11-05",
    edition_target: "both",
    status: "active",
    original_claim: "Recurring routine clubroom open hours and internal member games were previously aggregated into the public events crawl.",
    correction_text: "Standard routine bar hours and regular internal leagues have been removed from the public event calendar and newsletter to spotlight major open community gatherings and special legion events.",
    action_taken: "Audit items #78 and #79 suppressed and removed from the active calendar."
  }
];

export default function Corrections() {
  const [corrections, setCorrections] = useState(FALLBACK_CORRECTIONS);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    async function loadCorrections() {
      try {
        if (supabase) {
          const { data, error } = await supabase
            .from("editorial_corrections")
            .select("*")
            .order("issue_date", { ascending: false });

          if (!error && data && data.length > 0) {
            setCorrections(data);
          }
        }
      } catch (err) {
        console.warn("Using fallback corrections:", err);
      } finally {
        setLoading(false);
      }
    }
    loadCorrections();
  }, []);

  const filtered = corrections.filter((c) => {
    if (!searchTerm) return true;
    const q = searchTerm.toLowerCase().trim();
    return (
      (c.title || "").toLowerCase().includes(q) ||
      (c.correction_text || "").toLowerCase().includes(q) ||
      (c.original_claim || "").toLowerCase().includes(q)
    );
  });

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col">
      {/* Top Banner Header */}
      <section className="bg-gradient-to-r from-blue-950 via-[#00008b] to-slate-900 text-white py-14 px-6 md:px-12 border-b-4 border-amber-400">
        <div className="max-w-4xl mx-auto text-center space-y-4">
          <div className="inline-flex items-center gap-2 bg-amber-400/20 text-amber-300 px-3.5 py-1 rounded-full text-xs font-black uppercase tracking-wider border border-amber-400/30">
            <span>⚖️ Transparency &amp; Editorial Accountability</span>
          </div>
          <h1 className="text-3xl md:text-5xl font-black tracking-tight text-white">
            Statements of Editorial Correction
          </h1>
          <p className="text-slate-200 text-base md:text-lg max-w-2xl mx-auto leading-relaxed">
            Welcome East Gwillimbury is dedicated to 100% accuracy in our community briefings, event schedules, and local merchant directories. When errors occur, we correct them transparently and promptly.
          </p>
        </div>
      </section>

      {/* Main Content Area */}
      <main className="max-w-[1440px] mx-auto px-6 py-12 flex-1 w-full space-y-8">
        {/* Editorial Policy Card */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 md:p-8 shadow-sm space-y-3">
          <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
            <span>📌</span> Our Correction Policy &amp; Standards
          </h2>
          <p className="text-sm text-slate-600 leading-relaxed">
            All submitted and scraped items are verified against official sources prior to publication. If you identify a factual error, date discrepancy, or outdated information in our Thursday Community Newsletter or online discovery calendars, please email{" "}
            <a href="mailto:contact@welcomeeg.ca" className="text-blue-700 font-bold hover:underline">
              contact@welcomeeg.ca
            </a>
            . Corrections are published immediately to this record and incorporated into upcoming newsletter broadcasts.
          </p>
        </div>

        {/* Search & Filter Bar */}
        <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
          <h2 className="text-xl font-black text-slate-900">
            Published Statements of Correction ({filtered.length})
          </h2>
          <input
            type="text"
            placeholder="Search corrections by keyword..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full sm:w-72 px-4 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600 shadow-sm"
          />
        </div>

        {/* Corrections Stream */}
        <div className="space-y-6">
          {filtered.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-xl border border-slate-200">
              <span className="text-3xl block mb-2">🔍</span>
              <p className="text-slate-500 font-medium">No statements of correction match your search.</p>
            </div>
          ) : (
            filtered.map((corr) => (
              <article
                key={corr.id}
                className="bg-white rounded-xl border-2 border-amber-300 p-6 md:p-8 shadow-sm space-y-4 hover:shadow-md transition-shadow"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                  <span className="text-xs font-black uppercase tracking-wider bg-amber-100 text-amber-900 px-2.5 py-0.5 rounded">
                    Official Correction Notice
                  </span>
                  <div className="flex items-center gap-3 text-xs text-slate-500 font-semibold">
                    <span>📅 {corr.issue_date || "Recent Issue"}</span>
                    <span>•</span>
                    <span className="uppercase text-blue-700 font-bold">
                      Target: {corr.edition_target ? corr.edition_target.replace("_", " ") : "All Editions"}
                    </span>
                  </div>
                </div>

                <h3 className="text-lg md:text-xl font-black text-slate-900">
                  {corr.title}
                </h3>

                {corr.original_claim && (
                  <div className="bg-rose-50 border-l-4 border-rose-500 p-3 rounded text-xs text-rose-900 space-y-1">
                    <strong className="block uppercase tracking-wider text-[10px] text-rose-700">Original Description / Discrepancy:</strong>
                    <p className="italic">{corr.original_claim}</p>
                  </div>
                )}

                <div className="bg-amber-50/70 border-l-4 border-amber-500 p-4 rounded text-sm text-slate-800 space-y-1">
                  <strong className="block uppercase tracking-wider text-[11px] text-amber-800 font-black">Official Correction &amp; Clarification:</strong>
                  <p className="leading-relaxed font-medium">{corr.correction_text}</p>
                </div>

                {corr.action_taken && (
                  <div className="text-xs text-slate-500 font-semibold pt-1">
                    <strong className="text-slate-700">Action Taken:</strong> {corr.action_taken}
                  </div>
                )}
              </article>
            ))
          )}
        </div>

        {/* Footer Support CTA */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-6 text-center space-y-2">
          <p className="text-sm text-blue-900 font-bold">Notice a mistake or outdated community event?</p>
          <p className="text-xs text-blue-700 max-w-lg mx-auto">
            Help keep Welcome East Gwillimbury accurate for all residents and visitors. Send corrections with details and links to{" "}
            <a href="mailto:contact@welcomeeg.ca" className="underline font-bold text-blue-950">
              contact@welcomeeg.ca
            </a>
            .
          </p>
        </div>
      </main>
    </div>
  );
}
