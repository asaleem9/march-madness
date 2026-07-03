// Service Worker for Web Push Notifications

self.addEventListener("push", function (event) {
  if (!event.data) return;

  const data = event.data.json();

  const options = {
    body: data.body || "You have a new update!",
    icon: "/images/logo.png",
    badge: "/images/logo.png",
    vibrate: [100, 50, 100],
    data: {
      url: data.url || "/dashboard",
    },
    actions: [
      {
        action: "open",
        title: "View",
      },
      {
        action: "dismiss",
        title: "Dismiss",
      },
    ],
  };

  event.waitUntil(
    self.registration.showNotification(
      data.title || "March Madness",
      options
    )
  );
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();

  if (event.action === "dismiss") return;

  const url = event.notification.data?.url || "/dashboard";

  event.waitUntil(
    clients.matchAll({ type: "window" }).then(function (clientList) {
      // Navigate an existing window to the target and focus it
      for (const client of clientList) {
        if ("focus" in client) {
          if ("navigate" in client) {
            return client.navigate(url).then((c) => (c || client).focus());
          }
          return client.focus();
        }
      }
      // Otherwise open a new window
      if (clients.openWindow) {
        return clients.openWindow(url);
      }
    })
  );
});
