/**
 * Welcome East Gwillimbury — Role Architecture & Access Control
 * Implements the 10-role permission matrix from v1.0 navigation & architecture tree.
 */

export const ROLES = {
  GUEST: 'guest',
  RESIDENT: 'resident',
  SUBMITTER: 'submitter',
  VENDOR: 'vendor',
  MERCHANT: 'merchant',
  MERCHANT_STAFF: 'merchant_staff',
  SALES_REP: 'sales_rep',
  EDITORIAL: 'editorial',
  ADMIN: 'admin',
  SUPER_ADMIN: 'super_admin',
};

export const KNOWN_SUPER_ADMIN_EMAILS = [
  'cheerfulweb@gmail.com',
  'stillcheerful@gmail.com',
  'admin@welcomeeg.ca',
];

export const KNOWN_EDITORIAL_EMAILS = [
  'editorial@welcomeeg.ca',
];

export const KNOWN_ADMIN_EMAILS = [
  ...KNOWN_SUPER_ADMIN_EMAILS,
  'info@welcomeeg.ca',
  'support@welcomeeg.ca',
];

/**
 * Determine the user's canonical platform role based on profile, email, or session attributes.
 * Staff/Admin roles require a verified Supabase session (`hasVerifiedSession = true`) to prevent
 * client-side localStorage privilege escalation.
 */
export function resolveUserRole(email, profileRole, portalRole, hasVerifiedSession = true) {
  const cleanEmail = (email || '').trim().toLowerCase();

  if (hasVerifiedSession) {
    // 1. Super Admin email match
    if (KNOWN_SUPER_ADMIN_EMAILS.includes(cleanEmail) || (cleanEmail.startsWith('stillcheerful+') && cleanEmail.includes('admin'))) {
      return ROLES.SUPER_ADMIN;
    }

    // 2. Editorial email match
    if (KNOWN_EDITORIAL_EMAILS.includes(cleanEmail) || cleanEmail.startsWith('editorial@')) {
      return ROLES.EDITORIAL;
    }

    // 3. Admin domain email match
    if (cleanEmail.endsWith('@welcomeeg.ca') || KNOWN_ADMIN_EMAILS.includes(cleanEmail)) {
      return ROLES.ADMIN;
    }
  }

  // 4. Stored/Profile role mapping (all authenticated roles require hasVerifiedSession)
  if (!hasVerifiedSession) {
    return ROLES.GUEST;
  }
  const roleCandidate = (profileRole || portalRole || '').toLowerCase().trim();

  if (roleCandidate === 'super_admin' || roleCandidate === 'superadmin') return ROLES.SUPER_ADMIN;
  if (roleCandidate === 'admin') return ROLES.ADMIN;
  if (roleCandidate === 'editorial' || roleCandidate === 'editor') return ROLES.EDITORIAL;
  if (roleCandidate === 'sales_rep' || roleCandidate === 'sales' || roleCandidate === 'rep') return ROLES.SALES_REP;
  if (roleCandidate === 'merchant_staff' || roleCandidate === 'staff') return ROLES.MERCHANT_STAFF;
  if (roleCandidate === 'merchant') return ROLES.MERCHANT;
  if (roleCandidate === 'vendor' || roleCandidate === 'partner' || roleCandidate.startsWith('business')) return ROLES.VENDOR;
  if (roleCandidate === 'submitter') return ROLES.SUBMITTER;
  if (roleCandidate === 'resident' || roleCandidate.startsWith('resident')) return ROLES.RESIDENT;

  if (cleanEmail) {
    // Authenticated user with no specific role assigned defaults to submitter/resident
    return ROLES.SUBMITTER;
  }

  return ROLES.GUEST;
}

/**
 * Public Submissions: Submitter, Vendor, Editorial, Admin, Super Admin
 */
export function canAccessSubmit(role) {
  return [
    ROLES.SUBMITTER,
    ROLES.VENDOR,
    ROLES.EDITORIAL,
    ROLES.ADMIN,
    ROLES.SUPER_ADMIN,
  ].includes(role);
}

/**
 * Wallet & Hamper Claim: Resident, Admin, Super Admin
 */
export function canAccessWallet(role) {
  return [
    ROLES.RESIDENT,
    ROLES.ADMIN,
    ROLES.SUPER_ADMIN,
  ].includes(role);
}

/**
 * Merchant Redemption: Merchant, Merchant Staff, Admin, Super Admin
 */
export function canAccessRedemption(role) {
  return [
    ROLES.MERCHANT,
    ROLES.MERCHANT_STAFF,
    ROLES.ADMIN,
    ROLES.SUPER_ADMIN,
  ].includes(role);
}

/**
 * Staff Tools & Approvals Hub: Editorial, Admin, Super Admin
 */
export function canAccessStaffTools(role) {
  return [
    ROLES.EDITORIAL,
    ROLES.ADMIN,
    ROLES.SUPER_ADMIN,
  ].includes(role);
}

/**
 * System Admin Utilities (Audit Log, Blacklist, Test runner): Admin, Super Admin
 */
export function canAccessAdminTools(role) {
  return [
    ROLES.ADMIN,
    ROLES.SUPER_ADMIN,
  ].includes(role);
}

/**
 * Get canonical landing destination per role
 */
export function getRoleHome(role) {
  switch (role) {
    case ROLES.SUBMITTER:
    case ROLES.VENDOR:
    case ROLES.MERCHANT:
    case ROLES.MERCHANT_STAFF:
      return '/my-submissions';
    case ROLES.SALES_REP:
    case ROLES.EDITORIAL:
      return '/staff/admin-approvals.html';
    case ROLES.ADMIN:
    case ROLES.SUPER_ADMIN:
      return '/admin';
    case ROLES.RESIDENT:
    case ROLES.GUEST:
    default:
      return '/events';
  }
}

/**
 * UI display badge & label styling for user roles
 */
export function getRoleDisplay(role) {
  switch (role) {
    case ROLES.SUPER_ADMIN:
      return {
        label: 'Super Admin',
        shortLabel: 'Super Admin',
        badgeClass: 'bg-purple-100 text-purple-950 border-purple-300 font-black',
        dotClass: 'bg-purple-600',
      };
    case ROLES.ADMIN:
      return {
        label: 'Staff Administrator',
        shortLabel: 'Admin',
        badgeClass: 'bg-amber-100 text-amber-950 border-amber-300 font-black',
        dotClass: 'bg-amber-500',
      };
    case ROLES.EDITORIAL:
      return {
        label: 'Editorial Team',
        shortLabel: 'Editorial',
        badgeClass: 'bg-indigo-100 text-indigo-950 border-indigo-300 font-black',
        dotClass: 'bg-indigo-600',
      };
    case ROLES.SALES_REP:
      return {
        label: 'Sales Representative',
        shortLabel: 'Sales',
        badgeClass: 'bg-sky-100 text-sky-950 border-sky-300 font-black',
        dotClass: 'bg-sky-600',
      };
    case ROLES.MERCHANT:
      return {
        label: 'Local Merchant',
        shortLabel: 'Merchant',
        badgeClass: 'bg-emerald-100 text-emerald-950 border-emerald-300 font-black',
        dotClass: 'bg-emerald-600',
      };
    case ROLES.MERCHANT_STAFF:
      return {
        label: 'Merchant Staff',
        shortLabel: 'Staff',
        badgeClass: 'bg-teal-100 text-teal-950 border-teal-300 font-black',
        dotClass: 'bg-teal-600',
      };
    case ROLES.VENDOR:
      return {
        label: 'Verified Vendor',
        shortLabel: 'Vendor',
        badgeClass: 'bg-blue-100 text-blue-950 border-blue-300 font-black',
        dotClass: 'bg-blue-600',
      };
    case ROLES.SUBMITTER:
      return {
        label: 'Community Submitter',
        shortLabel: 'Submitter',
        badgeClass: 'bg-blue-50 text-blue-900 border-blue-200 font-bold',
        dotClass: 'bg-blue-500',
      };
    case ROLES.RESIDENT:
      return {
        label: 'East Gwillimbury Resident',
        shortLabel: 'Resident',
        badgeClass: 'bg-emerald-50 text-emerald-900 border-emerald-200 font-bold',
        dotClass: 'bg-emerald-500',
      };
    case ROLES.GUEST:
    default:
      return {
        label: 'Guest Visitor',
        shortLabel: 'Guest',
        badgeClass: 'bg-gray-100 text-gray-700 border-gray-200 font-medium',
        dotClass: 'bg-gray-400',
      };
  }
}
