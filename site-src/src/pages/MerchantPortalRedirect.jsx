import React, { useEffect } from 'react';

export default function MerchantPortalRedirect() {
  useEffect(() => {
    const search = window.location.search || '';
    const hash = window.location.hash || '';
    window.location.replace('/my-submissions' + search + hash);
  }, []);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#00008b]"></div>
      <p className="text-sm font-bold text-slate-600">Opening My Submissions...</p>
    </div>
  );
}
