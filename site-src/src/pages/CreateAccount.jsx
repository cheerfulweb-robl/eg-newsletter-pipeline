import React from 'react';
import { Link } from 'react-router-dom';

export default function CreateAccount() {
  return (
    <div className="max-w-[1440px] mx-auto w-full p-4 md:p-12">
      <div className="max-w-4xl mx-auto">
        {/* Breadcrumb */}
        <div className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-4">
          <Link to="/" className="text-slate-700 hover:text-[#00008b] font-bold">Home</Link>
          <span className="mx-2 text-slate-400">/</span>
          <span className="text-slate-900 font-extrabold">Join Welcome East Gwillimbury</span>
        </div>

        {/* Header */}
        <div className="text-center mb-10">
          <span className="inline-block bg-blue-100 text-[#00008b] font-black text-xs uppercase px-3.5 py-1.5 rounded-full mb-3 tracking-wider border border-blue-200">
            Welcome East Gwillimbury Community Pathways
          </span>
          <h1 className="text-3xl md:text-5xl font-black text-slate-900 tracking-tight">
            Choose Your Membership Pathway
          </h1>
          <p className="text-slate-700 text-base md:text-lg mt-3 max-w-2xl mx-auto font-medium">
            Welcome East Gwillimbury connects residents, visitors, performers, and local venues across Holland Landing, Mount Albert, Queensville, Sharon, and East Gwillimbury. Choose your role below to get started:
          </p>

          {/* Existing Account Prompt Banner */}
          <div className="mt-5 inline-flex items-center gap-2 bg-white px-5 py-2.5 rounded-2xl border-2 border-slate-300 shadow-xs text-xs sm:text-sm text-slate-800 font-bold">
            <span>Already registered with Welcome East Gwillimbury?</span>
            <Link
              to="/login"
              className="text-[#00008b] hover:text-blue-900 font-black underline uppercase tracking-wider ml-1"
            >
              Sign In to Your Account &rarr;
            </Link>
          </div>
        </div>

        {/* 2 Distinct Registration Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8">
          {/* Card 1: Community Event Organizer & Submitter */}
          <div className="bg-white rounded-3xl p-7 border-2 border-slate-300 hover:border-indigo-600 shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
            <div>
              <span className="inline-block bg-indigo-100 text-indigo-950 text-xs font-black uppercase px-3 py-1.5 rounded-full tracking-wider border border-indigo-300 mb-3">
                Event Organizers &amp; Venues
              </span>

              <h2 className="text-2xl font-black text-slate-900 mb-2">
                Event Submitter Account
              </h2>

              <p className="text-xs text-slate-700 font-medium mb-5 leading-relaxed">
                Organizing a concert, workshop, market, festival, or community activity? Publish your events directly to our 45-day calendar with live status tracking.
              </p>

              <div className="space-y-2.5 mb-6 border-t border-slate-100 pt-4 text-xs text-slate-800 font-bold">
                <div className="flex items-start gap-2">
                  <span className="text-indigo-700 font-black">&#10003;</span>
                  <span>Instant submission to the 45-day Sunday–Saturday calendar</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-indigo-700 font-black">&#10003;</span>
                  <span>Automated inclusion in Thursday 7 AM reader newsletter</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-indigo-700 font-black">&#10003;</span>
                  <span>Passwordless Magic Link email authentication</span>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <a
                href="/news/login.html"
                className="block w-full text-center bg-indigo-700 hover:bg-indigo-800 text-white font-black text-xs uppercase tracking-wider py-3.5 rounded-xl shadow-sm transition-all"
              >
                Sign In With Magic Link &rarr;
              </a>
              <Link
                to="/submission"
                className="block w-full text-center text-xs font-black text-indigo-800 hover:underline pt-1"
              >
                Or Open Public Event Form &rarr;
              </Link>
            </div>
          </div>

          {/* Card 2: Community Newsletter Reader */}
          <div className="bg-white rounded-3xl p-7 border-2 border-slate-300 hover:border-amber-600 shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
            <div>
              <span className="inline-block bg-amber-100 text-amber-950 text-xs font-black uppercase px-3 py-1.5 rounded-full tracking-wider border border-amber-300 mb-3">
                All Residents &amp; Community Fans
              </span>

              <h2 className="text-2xl font-black text-slate-900 mb-2">
                Community Reader
              </h2>

              <p className="text-xs text-slate-700 font-medium mb-5 leading-relaxed">
                Stay in the loop with what is happening in East Gwillimbury. Receive 100+ local weekend events, concerts, library workshops, and town updates every Thursday morning.
              </p>

              <div className="space-y-2.5 mb-6 border-t border-slate-100 pt-4 text-xs text-slate-800 font-bold">
                <div className="flex items-start gap-2">
                  <span className="text-amber-700 font-black">&#10003;</span>
                  <span>Every Thursday at 7:00 AM in your inbox</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-amber-700 font-black">&#10003;</span>
                  <span>Live 45-day weekend events calendar overview</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-amber-700 font-black">&#10003;</span>
                  <span>100% Free &amp; CASL compliant (1-click unsubscribe)</span>
                </div>
              </div>
            </div>

            <Link
              to="/subscribe"
              className="w-full text-center bg-amber-600 hover:bg-amber-700 text-white font-black text-xs uppercase tracking-wider py-3.5 rounded-xl shadow-sm transition-all block"
            >
              Subscribe Free &rarr;
            </Link>
          </div>
        </div>

        {/* Bottom Helper Bar */}
        <div className="mt-12 text-center border-t-2 border-slate-200 pt-8 flex flex-col sm:flex-row items-center justify-center gap-6 text-xs text-slate-600 font-bold">
          <div>
            Already registered?{' '}
            <Link to="/login" className="text-[#00008b] font-black hover:underline uppercase">
              Sign In to Your Account
            </Link>
          </div>
          <span className="hidden sm:inline text-slate-400">&bull;</span>
          <div>
            Need assistance?{' '}
            <a href="mailto:support@welcomeeg.ca" className="text-slate-900 font-black hover:underline uppercase">
              support@welcomeeg.ca
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
