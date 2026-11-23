// One phone rule for every form. Keep in sync with wgPhoneProblem in
// website/staff/admin-approvals.html and phoneProblem in website/hamper/index.html.
// Returns '' when the number is acceptable, otherwise a message for the person.
export function phoneProblem(raw) {
  let d = String(raw || '').replace(/\D/g, '');
  if (d.length === 11 && d.startsWith('1')) d = d.slice(1);   // country code
  if (d.length !== 10) return 'Please enter a 10-digit phone number, e.g. (905) 728-4196.';
  if (/^[01]/.test(d) || /^\d{3}[01]/.test(d)) return 'Please check the phone number: area codes and exchanges cannot start with 0 or 1.';
  if (/(\d)\1{3}/.test(d)) return 'Please enter a real phone number (no four identical digits in a row, like 3333).';
  for (let i = 0; i + 4 <= d.length; i++) {
    const a = d.slice(i, i + 4).split('').map(Number);
    const up = a.every((n, k) => k === 0 || n === a[k - 1] + 1);
    const down = a.every((n, k) => k === 0 || n === a[k - 1] - 1);
    if (up || down) return 'Please enter a real phone number (no runs like 1234 or 4321).';
  }
  return '';
}
