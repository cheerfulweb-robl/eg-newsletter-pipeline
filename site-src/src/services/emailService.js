import { supabase } from '../supabaseClient';

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Decides the starting status for a public submission (events, dining, sales).
 * A visitor already signed in with the same email has proven that address, so the
 * listing goes straight to the review queue ('pending'). Everyone else starts as
 * 'pending_verification' until they click the emailed link. The database insert
 * policy enforces the same rule, so this cannot be bypassed from the browser.
 */
export async function getInitialSubmissionStatus(contactEmail) {
  const cleanEmail = String(contactEmail || '').trim().toLowerCase();
  try {
    const { data } = await supabase.auth.getSession();
    const sessionEmail = String(data?.session?.user?.email || '').trim().toLowerCase();
    if (cleanEmail && sessionEmail && sessionEmail === cleanEmail) return 'pending';
  } catch (err) {
    console.warn('Session check skipped:', err);
  }
  return 'pending_verification';
}

/**
 * Email 1: asks the send-email function to email the submitter a one-time
 * confirmation link. The token and the email itself are created server-side.
 * If the listing was saved as 'pending' (signed-in submitter, email already
 * proven), it instead sends the staff alert + receipt straight away.
 */
export async function sendSubmissionVerificationEmail({ contactEmail, id = '', status = 'pending_verification' }) {
  const cleanEmail = String(contactEmail || '').trim().toLowerCase();
  if (!cleanEmail.includes('@') || !id) {
    console.warn('Cannot send verification email: missing email or listing id');
    return { success: false };
  }

  const body = status === 'pending'
    ? { formType: 'submission_notify', record: { id } }
    : { formType: 'submission_verify_request', record: { id, email: cleanEmail } };

  try {
    const { data, error } = await supabase.functions.invoke('send-email', { body });
    if (error) {
      console.warn('sendSubmissionVerificationEmail error:', error);
      return { success: false, error };
    }
    return { success: true, data };
  } catch (err) {
    console.warn('Failed to dispatch submission verification email:', err);
    return { success: false, error: err };
  }
}
