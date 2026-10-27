const OLD_HOST = 'brunathens.pages.dev';
const NEW_ORIGIN = 'https://kerdiseto.stoaops.com';

// Στέλνει το παλιό Pages host στο kerdiseto.stoaops.com με 308, κρατώντας path και query.
// Τα preview URLs μένουν ανέπαφα.
export async function onRequest(context) {
  const url = new URL(context.request.url);
  if (url.hostname !== OLD_HOST) return context.next();

  return Response.redirect(`${NEW_ORIGIN}${url.pathname}${url.search}`, 308);
}
