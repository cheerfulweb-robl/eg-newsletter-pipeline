import React from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck, Lock, Mail, ArrowRight, UserCheck } from 'lucide-react';

export default function Privacy() {
  return (
    <div className="max-w-[1440px] mx-auto w-full p-4 md:p-12 pb-24">
      <div className="bg-white p-8 md:p-12 rounded-3xl shadow-sm border border-gray-200 space-y-8">
        <div>
          <span className="text-xs font-black uppercase tracking-widest text-emerald-800 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200 flex items-center gap-1.5 w-fit">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            PIPEDA &amp; Canadian Privacy Compliance
          </span>
          <h1 className="text-3xl md:text-5xl font-black text-gray-900 mt-3 mb-2 tracking-tight">
            Privacy Policy &amp; Data Responsibilities
          </h1>
          <p className="text-sm text-gray-500 font-bold">
            Last Updated: October 30, 2026 • Welcome East Gwillimbury &amp; East Gwillimbury Community Platform
          </p>
        </div>

        <div className="prose prose-slate max-w-none text-gray-700 space-y-6 text-sm md:text-base leading-relaxed">
          <p>
            Welcome East Gwillimbury ("we," "our," or "us") respects your personal privacy. This Privacy Policy details our responsibilities, how we collect, safeguard, and utilize your personal information across <strong>welcomeeg.ca</strong> in compliance with the Canadian <strong>Personal Information Protection and Electronic Documents Act (PIPEDA)</strong> and applicable Ontario provincial laws.
          </p>

          {/* Section 1 */}
          <div className="border-t border-gray-200 pt-6">
            <h2 className="text-xl font-black text-gray-900 mb-3 flex items-center gap-2">
              <span className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center text-sm font-black">1</span>
              <span>Information We Collect &amp; Why</span>
            </h2>
            <p>
              We only collect data strictly necessary to deliver Welcome Hampers, administer digital wallet vouchers, and publish community notices:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-sm text-gray-600">
              <li>
                <strong>New Resident Hamper Applicants:</strong> First and last name, email address, physical delivery address (Street, Unit, Town, Postal Code within East Gwillimbury), and move-in timeframe. This data is collected solely to verify residency and deliver the digital/physical welcome packet.
              </li>
              <li>
                <strong>Local Business Partners:</strong> Business operating name, contact name, business physical address, phone number, email address, and commercial offer parameters.
              </li>
              <li>
                <strong>Newsletter Subscribers:</strong> Email address, preferred edition (Community Reader vs. Business/Vendor), and neighbourhood area within East Gwillimbury.
              </li>
            </ul>
          </div>

          {/* Section 2 */}
          <div className="border-t border-gray-200 pt-6">
            <h2 className="text-xl font-black text-gray-900 mb-3 flex items-center gap-2">
              <span className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center text-sm font-black">2</span>
              <span>Our Privacy Responsibilities &amp; Commitments</span>
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 my-3">
              <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-xs">
                <h4 className="font-black text-emerald-950 text-sm mb-1">No Data Resale</h4>
                <p className="text-emerald-900 leading-relaxed">
                  We never sell, rent, monetize, or trade your personal information, address records, or email lists to third-party brokers or advertisers.
                </p>
              </div>
              <div className="p-4 rounded-2xl bg-blue-50 border border-blue-200 text-xs">
                <h4 className="font-black text-[#00008b] text-sm mb-1">Encrypted Infrastructure</h4>
                <p className="text-blue-900 leading-relaxed">
                  All databases and email workflows utilize industry-standard TLS encryption, strict Row-Level Security (RLS), and SOC-2 compliant hosting.
                </p>
              </div>
            </div>
          </div>

          {/* Section 3 */}
          <div className="border-t border-gray-200 pt-6">
            <h2 className="text-xl font-black text-gray-900 mb-3 flex items-center gap-2">
              <span className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center text-sm font-black">3</span>
              <span>Address Handling &amp; Verification Safeguards</span>
            </h2>
            <p>
              Physical addresses submitted via the Hamper Claim form are used exclusively by authorized Welcome East Gwillimbury staff for verification and route planning. Addresses are never published publicly on the website or exposed to participating sponsor merchants. When you redeem an offer in-store, the merchant terminal verifies only the valid voucher code and customer first name.
            </p>
          </div>

          {/* Section 4 */}
          <div className="border-t border-gray-200 pt-6">
            <h2 className="text-xl font-black text-gray-900 mb-3 flex items-center gap-2">
              <span className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center text-sm font-black">4</span>
              <span>Email Communication &amp; Unsubscribe Rights</span>
            </h2>
            <p>
              In full compliance with Canadian Anti-Spam Legislation (CASL):
            </p>
            <ul className="list-disc pl-6 space-y-1 text-sm text-gray-600">
              <li>Transactional emails (claim confirmations, wallet authorization links, voucher receipts) are sent only in connection with an active service request.</li>
              <li>Community newsletters contain a prominent, single-click unsubscribe link at the bottom of every edition.</li>
              <li>You may request complete removal of your email profile from our system at any time.</li>
            </ul>
          </div>

          {/* Section 5 */}
          <div className="border-t border-gray-200 pt-6">
            <h2 className="text-xl font-black text-gray-900 mb-3 flex items-center gap-2">
              <span className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center text-sm font-black">5</span>
              <span>Designated Privacy Contact &amp; Data Requests</span>
            </h2>
            <p>
              Under PIPEDA, you hold the legal right to request an audit of your personal data held by Welcome East Gwillimbury, or request data corrections or permanent deletion.
            </p>
            <div className="p-5 rounded-2xl bg-gray-50 border border-gray-200 text-xs sm:text-sm space-y-2 mt-3">
              <p><strong>Designated Privacy Officer:</strong> Robel (Welcome East Gwillimbury / Cheerful Media)</p>
              <p className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-gray-500" />
                <span><strong>Privacy Email:</strong> <a href="mailto:privacy@welcomeeg.ca" className="text-[#00008b] font-bold underline">privacy@welcomeeg.ca</a></span>
              </p>
              <p><strong>Mailing Address:</strong> Welcome East Gwillimbury Community Platform, Town of East Gwillimbury, Ontario, Canada</p>
            </div>
          </div>
        </div>

        {/* Action Link to Support */}
        <div className="pt-6 border-t border-gray-200 flex flex-col sm:flex-row justify-between items-center gap-4">
          <span className="text-xs text-gray-500 font-bold">
            Need assistance or have privacy questions?
          </span>
          <Link
            to="/knowledge-base#support"
            className="text-xs font-black uppercase text-[#00008b] hover:underline flex items-center gap-1"
          >
            <span>Visit Help &amp; Support Desk</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    </div>
  );
}
