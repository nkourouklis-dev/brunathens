self.addEventListener('push', (event) => {
  let data = {
    title: 'BRUN',
    body: 'Έχεις νέα παραγγελία.',
    url: '/',
  };

  if (event.data) {
    try {
      data = { ...data, ...event.data.json() };
    } catch {
      data.body = event.data.text();
    }
  }

  event.waitUntil(self.registration.showNotification(data.title, {
    body: data.body,
    icon: '/favicon.svg',
    badge: '/favicon.svg',
    tag: 'brun-order',
    renotify: true,
    data: { url: data.url || '/' },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || '/', self.location.origin).href;

  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existingClient = clients.find((client) => 'focus' in client);
    if (existingClient) {
      await existingClient.focus();
      return existingClient.navigate(targetUrl);
    }
    return self.clients.openWindow(targetUrl);
  })());
});
