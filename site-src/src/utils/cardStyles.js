/**
 * Shared card styling tokens and category-to-stripe helpers so interior pages
 * match the vibrant, tactile look of Home page cards across all sites.
 */

export const CARD_SHELL_CLASS =
  'bg-white rounded-[1.75rem] border-2 border-lake-100 shadow-sm hover:-translate-y-1 hover:border-sun-300 hover:shadow-lift transition-[transform,box-shadow,border-color] duration-200 overflow-hidden flex flex-col justify-between min-w-0 max-w-full group';

/**
 * Returns a Tailwind background class for the top 8px/10px accent stripe on interior cards.
 */
export function getCardStripeClass(categoryOrType = '', fallback = 'lake') {
  const s = String(categoryOrType || '').toLowerCase();
  if (s.includes('dining') || s.includes('restaurant') || s.includes('food') || s.includes('eat in')) {
    return 'bg-coral-500';
  }
  if (s.includes('sale') || s.includes('deal') || s.includes('discount') || s.includes('market') || s.includes('family')) {
    return 'bg-sun-400';
  }
  if (s.includes('outdoor') || s.includes('park') || s.includes('trail') || s.includes('sport') || s.includes('take out') || s.includes('nature')) {
    return 'bg-emerald-600';
  }
  if (s.includes('music') || s.includes('festival') || s.includes('concert') || s.includes('art') || s.includes('culture')) {
    return 'bg-coral-500';
  }
  if (s.includes('business') || s.includes('directory') || s.includes('service')) {
    return 'bg-lake-700';
  }
  if (fallback === 'coral') return 'bg-coral-500';
  if (fallback === 'sun') return 'bg-sun-400';
  if (fallback === 'emerald') return 'bg-emerald-600';
  return 'bg-lake-600';
}
