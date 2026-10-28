// Παλιό service worker της εφαρμογής παραγγελιών BRUN: αυτοκαταργείται και καθαρίζει τα caches, ώστε οι συσκευές
// που τον είχαν εγκατεστημένο να παίρνουν πάντα τη νέα εφαρμογή.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) await caches.delete(key)
    await self.registration.unregister()
    for (const client of await self.clients.matchAll({ type: 'window' })) client.navigate(client.url)
  })())
})
