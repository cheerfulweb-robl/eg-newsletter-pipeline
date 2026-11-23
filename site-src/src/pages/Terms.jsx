import React from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck, FileText, CheckCircle2, AlertTriangle, ArrowRight } from 'lucide-react';

export default function Terms() {
  return (
    <div className="max-w-[1440px] mx-auto w-full p-4 md:p-12 pb-24">
      <div className="bg-white p-8 md:p-12 rounded-3xl shadow-sm border border-gray-200 space-y-8">
        <div>
          <span className="text-xs font-black uppercase tracking-widest text-[#00008b] bg-blue-50 px-3 py-1 rounded-full border border-blue-200">
            Legal &amp; Operational Agreement
          </span>
          <h1 className="text-3xl md:text-5xl font-black text-gray-900 mt-3 mb-2 tracking-tight">
            Terms of Service
          </h1>
          <p className="text-sm text-gray-500 font-bold">
            Last Updated: October 30, 2026 • Welcome East Gwillimbury Platform &amp; Hamper Program
          </p>
        </div>

        <div className="prose prose-slate max-w-none text-gray-700 space-y-6 text-sm md:text-base leading-relaxed">
          <p>
            These Terms of Service ("Terms") constitute a legally binding agreement between you ("User," "Resident," or "Partner Business") and <strong>Welcome East Gwillimbury</strong> (operated in connection with Cheerful Media, East Gwillimbury, Ontario). By accessing <strong>welcomeeg.ca</strong>, claiming a Welcome Hamper, presenting or redeeming a digital perk pass, registering as a partner sponsor, or submitting local events/sales, you agree to be bound by these Terms.
          </p>

          {/* Section 1 */}
          <div className="border-t border-gray-200 pt-6">
            <h2 className="text-xl font-black text-gray-900 mb-3 flex items-center gap-2">
              <span className="w-7 h-7 rounded-lg bg-blue-100 text-[#00008b] flex items-center justify-center text-sm font-black">1</span>
              <span>Eligibility &amp; Residency Verification</span>
            </h2>
            <p>
              Welcome Hampers and the Resident Digital Wallet are strictly intended for individuals and families relocating to or newly established within the <strong>Town of East Gwillimbury, Ontario</strong> (including Holland Landing, Mount Albert, Queensville, Sharon, Brown Hill, River Drive Park, and immediate lakefront corridors).
            </p>
            <ul className="list-disc pl-6 space-y-1 text-sm text-gray-600">
              <li>Hamper claims require a valid residential delivery address within the designated municipality.</li>
              <li>New Business Perk Passes are reserved for newly incorporated or launched physical or commercial operations within East Gwillimbury.</li>
              <li>We reserve the right to verify residency or commercial lease/ownership prior to digital pass authorization. One hamper per household/business.</li>
            </ul>
          </div>

          {/* Section 2 */}
          <div className="border-t border-gray-200 pt-6">
            <h2 className="text-xl font-black text-gray-900 mb-3 flex items-center gap-2">
              <span className="w-7 h-7 rounded-lg bg-blue-100 text-[#00008b] flex items-center justify-center text-sm font-black">2</span>
              <span>Digital Welcome Hampers &amp; Voucher Redemption</span>
            </h2>
            <p>
              Welcome East Gwillimbury operates primarily as a mobile-first digital platform. When a claim is authorized, the recipient receives a Digital Wallet populated with community vouchers:
            </p>
            <ul className="list-disc pl-6 space-y-1 text-sm text-gray-600">
              <li><strong>6-Character Presentation Code:</strong> To redeem an offer, customers tap "Present Offer" to generate a unique 6-character alphanumeric code (e.g., <code>WG2345</code>, entered without hyphens).</li>
              <li><strong>Single-Use Burning:</strong> Each voucher can only be validated once. When burned at the Merchant Terminal, an official transaction receipt is generated (e.g. <code>REC-XXXXXXXX</code>).</li>
              <li><strong>Non-Transferable:</strong> Digital vouchers and wallet codes are non-transferable, have no cash redemption value, and cannot be resold.</li>
            </ul>
          </div>

          {/* Section 3 */}
          <div className="border-t border-gray-200 pt-6">
            <h2 className="text-xl font-black text-gray-900 mb-3 flex items-center gap-2">
              <span className="w-7 h-7 rounded-lg bg-blue-100 text-[#00008b] flex items-center justify-center text-sm font-black">3</span>
              <span>Physical Items &amp; Merchant Fulfillment Policy</span>
            </h2>
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl text-amber-950 font-semibold text-sm mb-3">
              Policy Notice: Hampers can have digital offers and any physical items must have pick-up/delivery arranged directly with the merchant.
            </div>
            <p>
              While Welcome East Gwillimbury coordinates digital voucher passes and promotional notifications, participating sponsor businesses are solely responsible for stocking, preparing, and fulfilling physical items, food products, merchandise, or services advertised in their offers.
            </p>
          </div>

          {/* Section 4 */}
          <div className="border-t border-gray-200 pt-6">
            <h2 className="text-xl font-black text-gray-900 mb-3 flex items-center gap-2">
              <span className="w-7 h-7 rounded-lg bg-blue-100 text-[#00008b] flex items-center justify-center text-sm font-black">4</span>
              <span>Business Sponsorship Tiers &amp; Billing Terms</span>
            </h2>
            <p>
              Local businesses participating in the Welcome Hamper ecosystem agree to the applicable tier parameters:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-sm text-gray-600">
              <li>
                <strong>Community Supporter (Free Tier):</strong> Directory presence and website-only sales publishing. Single-use welcome hamper reception. Free of charge.
              </li>
              <li>
                <strong>Digital Sponsor Tier ($39.99/month):</strong> Includes setup and business profile verification fee of $49.99. The first month of active subscription is complimentary (30 days free). Thereafter, recurring monthly sponsorship of $39.99/month is payable via Interac e-Transfer (credit card billing via Stripe coming soon).
              </li>
              <li>
                <strong>Cancellation:</strong> Monthly sponsorships may be paused or cancelled at any time by notifying support@welcomeeg.ca with 5 business days' notice before the next billing cycle.
              </li>
            </ul>
          </div>

          {/* Section 5 */}
          <div className="border-t border-gray-200 pt-6">
            <h2 className="text-xl font-black text-gray-900 mb-3 flex items-center gap-2">
              <span className="w-7 h-7 rounded-lg bg-blue-100 text-[#00008b] flex items-center justify-center text-sm font-black">5</span>
              <span>Community Event &amp; Sales Submission Guidelines</span>
            </h2>
            <p>
              Submissions to the Community Calendar and Sales directory must reflect accurate, truthful, and lawful activities taking place in or directly serving East Gwillimbury. We reserve the right to review, edit for clarity, or decline any submission that includes false claims, adult content, or unauthorized third-party trademarks.
            </p>
          </div>

          {/* Section 6 */}
          <div className="border-t border-gray-200 pt-6">
            <h2 className="text-xl font-black text-gray-900 mb-3 flex items-center gap-2">
              <span className="w-7 h-7 rounded-lg bg-blue-100 text-[#00008b] flex items-center justify-center text-sm font-black">6</span>
              <span>Limitation of Liability &amp; Disclaimers</span>
            </h2>
            <p>
              Welcome East Gwillimbury acts as an informational directory and marketing facilitator. To the maximum extent permitted under the laws of the Province of Ontario and the federal laws of Canada, Welcome East Gwillimbury and its operators shall not be liable for any merchant disputes, product defects, physical delivery issues, or commercial losses resulting from promotions listed on the platform.
            </p>
          </div>
        </div>

        {/* Action Link to Support */}
        <div className="pt-6 border-t border-gray-200 flex flex-col sm:flex-row justify-between items-center gap-4">
          <span className="text-xs text-gray-500 font-bold">
            Questions regarding these Terms?
          </span>
          <Link
            to="/knowledge-base#support"
            className="text-xs font-black uppercase text-[#00008b] hover:underline flex items-center gap-1"
          >
            <span>Contact Support Desk</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    </div>
  );
}
