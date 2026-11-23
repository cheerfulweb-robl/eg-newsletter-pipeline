import { supabase } from '../supabaseClient';

// Newsletter sign-up used by /subscribe and the submission forms: always registers
// for BOTH Monday (Mon-Fri listings) and Thursday (this coming weekend & next weekend,
// Fri-Sun listings) editions via the secure double-opt-in RPC.
export async function subscribeReader({ email, firstName, lastName, area }) {
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (!cleanEmail.includes('@')) return false;
  const fName = String(firstName || '').trim() || 'Friend';
  const lName = String(lastName || '').trim();
  const { data, error } = await supabase.rpc('register_newsletter_subscriber', {
    email_input: cleanEmail,
    first_name_input: fName,
    area_input: area || 'All East Gwillimbury',
    audience_input: 'reader',
    thursday_input: true,
    monday_input: true
  });
  if (error) {
    console.warn('Newsletter sign-up note:', error);
    return false;
  }
  if (lName) {
    try {
      await supabase.from('newsletter_subscribers').update({
        last_name: lName,
        name: `${fName} ${lName}`.trim()
      }).eq('email', cleanEmail);
    } catch (_) {}
  }
  try {
    await supabase.functions.invoke('send-email', {
      body: {
        formType: 'newsletter_signup',
        record: {
          ...(data || {}),
          email: cleanEmail,
          first_name: fName,
          last_name: lName,
          audience_type: 'reader',
          community_area: area || 'All East Gwillimbury',
          wants_monday: true,
          wants_thursday: true,
          token: (data && data.token) || ''
        }
      }
    });
  } catch (e) {
    console.warn('Newsletter confirmation email note:', e);
  }
  return true;
}
