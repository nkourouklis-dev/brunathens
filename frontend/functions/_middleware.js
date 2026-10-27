const OLD_HOST = 'kerdiseto.pages.dev';
const NEW_ORIGIN = 'https://kerdiseto.stoaops.com';

// Στέλνει μόνο το kerdiseto.pages.dev στο kerdiseto.stoaops.com με 308, κρατώντας path και query.
// Το ίδιο build τρέχει και στο project brunathens, που δεν επηρεάζεται. Τα preview URLs μένουν ανέπαφα.
export async function onRequest(context) {
  const url = new URL(context.request.url);
  if (url.hostname !== OLD_HOST) return context.next();

  return Response.redirect(`${NEW_ORIGIN}${url.pathname}${url.search}`, 308);
}
