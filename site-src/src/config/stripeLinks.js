// Stripe Payment Links & Customer Portal for "Quick Search Sponsored" ad space.
// Live Stripe Payment Link URLs (https://buy.stripe.com/...) and
// Stripe Customer Portal URL (https://billing.stripe.com/p/login/...).

export const STRIPE_LINKS = {
  quickSearchWeekly: 'https://buy.stripe.com/28E14o4k31h2fQS7uYeQM00',
  quickSearchMonthly: 'https://buy.stripe.com/7sYaEY3fZf7SeMOeXqeQM01',
  galleryWeekly: 'https://buy.stripe.com/fZufZicQz3pa7km8z2eQM02',
  galleryMonthly: 'https://buy.stripe.com/dRm5kE5o76Bm0VY3eIeQM03',
  newsletterSingle: 'https://buy.stripe.com/28EeVe9En0cY6gibLeeQM04',
  newsletterFourPack: 'https://buy.stripe.com/5kQ14ocQzcZK7kmdTmeQM05',
  pressRelease: 'https://buy.stripe.com/6oU8wQcQzbVGbAC6qUeQM06',
  customerPortal: 'https://billing.stripe.com/p/login/28E14o4k31h2fQS7uYeQM00',
};

export function isConfiguredStripeUrl(url) {
  return typeof url === 'string' && /^https:\/\/(buy|billing|checkout)\.stripe\.com\//i.test(url.trim());
}
