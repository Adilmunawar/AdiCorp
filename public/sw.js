/*
 * AdiCorp service worker. It does one job: show the notifications AdiCorp pushes
 * (Edge Function "push-send"), even when no AdiCorp tab is open, and open the right
 * page when one is tapped. It caches nothing and never touches page loads.
 * Registered with scope "/" by src/modules/engagement/lib/push.ts for staff and portal.
 */

const ICON = "/AdilMunawar-Uploads/AdiCorp%20-%20Logo.png";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

function safePath(value, fallback) {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//") ? value : fallback;
}

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: event.data ? event.data.text() : "" };
  }
  const fallback = data.audience === "portal" ? "/portal" : "/notifications";
  const options = {
    body: typeof data.body === "string" ? data.body : "",
    icon: ICON,
    badge: ICON,
    data: { url: safePath(data.url, fallback) },
    timestamp: typeof data.at === "number" ? data.at : Date.now(),
    lang: "en",
  };
  if (typeof data.tag === "string" && data.tag) {
    options.tag = data.tag;
    options.renotify = true;
  }
  const title = typeof data.title === "string" && data.title ? data.title : "AdiCorp HR";
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = safePath((event.notification.data || {}).url, "/");
  const target = new URL(url, self.location.origin).href;
  const portal = url.startsWith("/portal");
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      // Prefer a tab of the same side (portal or staff app) so the session in it is the right one.
      const same = windows.find((w) => new URL(w.url).pathname.startsWith("/portal") === portal) || windows[0];
      if (same) {
        try {
          const moved = same.url === target ? same : await same.navigate(target);
          await (moved || same).focus();
          return;
        } catch {
          /* not ours to steer: open a fresh one below */
        }
      }
      await self.clients.openWindow(target);
    })(),
  );
});

// The browser replaced its subscription on its own (keys rotated or it expired): tell open tabs,
// which re-register it with the signed-in account the next time they load.
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const w of windows) w.postMessage({ type: "adicorp:push-resubscribe" });
    })(),
  );
});
