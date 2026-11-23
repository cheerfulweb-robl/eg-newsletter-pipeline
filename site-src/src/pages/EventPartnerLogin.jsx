import React, { useEffect } from 'react';

export default function EventPartnerLogin() {
  useEffect(() => {
    const search = window.location.search || '';
    const hash = window.location.hash || '';
    window.location.replace('/news/login.html' + search + hash);
  }, []);

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center p-8 text-center">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#00008b] mb-4"></div>
      <h2 className="text-lg font-black text-slate-900">Redirecting to Event Submitter Magic Link Sign In...</h2>
      <p className="text-xs text-slate-500 mt-1">
        If you are not redirected automatically,{' '}
        <a href="/news/login.html" className="text-[#00008b] font-bold underline">
          click here to open /news/login.html
        </a>
        .
      </p>
    </div>
  );
}
