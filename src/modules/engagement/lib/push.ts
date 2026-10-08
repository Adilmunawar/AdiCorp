import { db } from "@/integrations/supabase/client";
import { portalRpc } from "@/lib/portal";

/**
 * The browser side of web push, without UI: find out what this browser allows, subscribe
 * it, and keep AdiCorp told. Browsers only let a site ask after a tap, and only once:
 * after "Block" the site cannot ask again (hence the unblock steps in PushPrompt).
 * Staff and portal use the same service worker (/sw.js, scope "/") with their own RPCs.
 */

export type PushPhase = "checking" | "on" | "off" | "denied" | "unsupported";
export type PushAudience = "staff" | "portal";

export interface PushDevice {
  id: string;
  device: string;
  created_at: string;
  last_ok_at: string | null;
  last_error: string | null;
  failures: number;
  endpoint_hash: string;
}

export interface PushReply {
  ok?: boolean;
  error?: string;
  devices?: number;
  created?: boolean;
}

export const SW_URL = "/sw.js";
export const SW_SCOPE = "/";
/** Set when someone turns notifications off on this device, so the page does not quietly turn them back on. */
const OFF_KEY = "adicorp.push.off";
const laterKey = (audience: PushAudience) => `adicorp.push.later.${audience}`;

export const store = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string | null): void {
    try {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    } catch {
      /* private mode: nothing remembered */
    }
  },
};

export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    window.isSecureContext &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export const isIos = () => typeof navigator !== "undefined" && /iPhone|iPad|iPod/.test(navigator.userAgent);
export const isAndroid = () => typeof navigator !== "undefined" && /Android/.test(navigator.userAgent);
/** The new Edge, whose quiet request is a bell inside the address bar. */
export const isEdge = () => typeof navigator !== "undefined" && /\bEdg\//.test(navigator.userAgent);

export function remindLaterUntil(audience: PushAudience): number {
  return Number(store.get(laterKey(audience)) ?? 0);
}

export function putOffReminder(audience: PushAudience, days = 7): void {
  store.set(laterKey(audience), String(Date.now() + days * 86_400_000));
}

/** "Chrome on Android", "Edge on Windows": enough for someone to recognise their own devices. */
export function deviceLabel(ua: string = typeof navigator !== "undefined" ? navigator.userAgent : ""): string {
  const browser = /EdgA?\//.test(ua)
    ? "Edge"
    : /SamsungBrowser\//.test(ua)
      ? "Samsung Internet"
      : /OPR\/|Opera/.test(ua)
        ? "Opera"
        : /Firefox\/|FxiOS/.test(ua)
          ? "Firefox"
          : /Chrome\/|CriOS/.test(ua)
            ? "Chrome"
            : /Safari\//.test(ua)
              ? "Safari"
              : "Browser";
  const os = /Android/.test(ua)
    ? "Android"
    : /iPhone|iPad|iPod/.test(ua)
      ? "iPhone"
      : /Windows/.test(ua)
        ? "Windows"
        : /Macintosh|Mac OS X/.test(ua)
          ? "Mac"
          : /Linux|CrOS/.test(ua)
            ? "Linux"
            : "";
  return os ? `${browser} on ${os}` : browser;
}

function keyBytes(b64u: string): Uint8Array {
  const raw = atob(b64u.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (b64u.length % 4)) % 4));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

function sameKey(a: ArrayBuffer | null | undefined, b: Uint8Array): boolean {
  if (!a) return false;
  const x = new Uint8Array(a);
  return x.length === b.length && x.every((v, i) => v === b[i]);
}

export async function endpointHash(endpoint: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(endpoint));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/* ------------------------------------------------------------- transport */

let publicKeyCache: string | null = null;

/** The site's VAPID public key (generated server-side on first use). */
export async function getPublicKey(): Promise<string> {
  if (publicKeyCache) return publicKeyCache;
  const { data } = await db.rpc("push_public_key");
  if (typeof data === "string" && data) {
    publicKeyCache = data;
    return data;
  }
  const { data: made, error } = await db.functions.invoke("push-send", { body: { action: "public_key" } });
  const key = (made as { publicKey?: string } | null)?.publicKey;
  if (error || !key) throw new Error("Notifications are not available right now. Try again later.");
  publicKeyCache = key;
  return key;
}

async function call<T>(audience: PushAudience, staffFn: string, portalFn: string, args: Record<string, unknown>): Promise<T> {
  if (audience === "portal") return portalRpc<T>(portalFn, args);
  const { data, error } = await db.rpc(staffFn, args);
  if (error) throw new Error(error.message || "Request failed");
  if (data && typeof data === "object" && "error" in data && (data as { error?: unknown }).error) {
    throw new Error(String((data as { error: unknown }).error));
  }
  return data as T;
}

export const pushApi = {
  subscribe: (audience: PushAudience, subscription: PushSubscriptionJSON, welcome: boolean) =>
    call<PushReply>(audience, "push_subscribe", "portal_push_subscribe", { p_subscription: subscription, p_device: deviceLabel(), p_welcome: welcome }),
  unsubscribe: (audience: PushAudience, endpoint: string) => call<PushReply>(audience, "push_unsubscribe", "portal_push_unsubscribe", { p_endpoint: endpoint }),
  removeDevice: (audience: PushAudience, id: string) => call<PushReply>(audience, "push_remove_device", "portal_push_remove_device", { p_id: id }),
  devices: (audience: PushAudience) => call<PushDevice[]>(audience, "push_devices", "portal_push_devices", {}),
  test: (audience: PushAudience) => call<PushReply>(audience, "push_test", "portal_push_test", {}),
};

/* --------------------------------------------------------------- browser */

async function registration(): Promise<ServiceWorkerRegistration> {
  await navigator.serviceWorker.register(SW_URL, { scope: SW_SCOPE });
  return navigator.serviceWorker.ready;
}

/** This browser's subscription, made (or remade, if the site's key changed) with the current key. */
async function subscription(publicKey: string): Promise<PushSubscription> {
  const reg = await registration();
  const key = keyBytes(publicKey);
  let sub = await reg.pushManager.getSubscription();
  if (sub && !sameKey(sub.options.applicationServerKey, key)) {
    await sub.unsubscribe().catch(() => false);
    sub = null;
  }
  return sub ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key as unknown as BufferSource }));
}

/** The endpoint of this browser's current subscription, if any. */
export async function currentEndpoint(): Promise<string | null> {
  if (!pushSupported()) return null;
  try {
    const reg = await navigator.serviceWorker.getRegistration(SW_SCOPE);
    const sub = await reg?.pushManager.getSubscription();
    return sub?.endpoint ?? null;
  } catch {
    return null;
  }
}

/**
 * What this browser allows right now. When it allows notifications, AdiCorp is made to
 * know it (`knownHashes` are the endpoint hashes the server already has for this person).
 */
export async function detectPush(audience: PushAudience, knownHashes: string[]): Promise<PushPhase> {
  if (!pushSupported()) return "unsupported";
  try {
    const permission = Notification.permission;
    if (permission === "denied") return "denied";
    if (permission !== "granted") return "off";
    const reg = await registration();
    const sub = await reg.pushManager.getSubscription();
    if (!sub && store.get(OFF_KEY)) return "off";
    const publicKey = await getPublicKey();
    const known = sub ? knownHashes.includes(await endpointHash(sub.endpoint)) : false;
    if (!sub || !sameKey(sub.options.applicationServerKey, keyBytes(publicKey)) || !known) {
      const fresh = await subscription(publicKey);
      await pushApi.subscribe(audience, fresh.toJSON(), false);
    }
    return "on";
  } catch {
    return "off";
  }
}

/**
 * The browser's question, however it gets answered. Edge and Chrome often ask quietly
 * (a bell in the address bar, no pop-up), and some people allow notifications from the
 * site settings instead, so the permission itself is watched too.
 */
function askPermission(): Promise<NotificationPermission> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (p: NotificationPermission) => {
      if (settled) return;
      settled = true;
      window.clearInterval(watch);
      resolve(p);
    };
    const watch = window.setInterval(() => {
      if (Notification.permission !== "default") finish(Notification.permission);
    }, 700);
    try {
      Notification.requestPermission().then(finish, () => finish(Notification.permission));
    } catch {
      finish(Notification.permission);
    }
  });
}

/** Asks the browser (must run from a tap), subscribes, and tells AdiCorp; `welcome` sends a first notification. */
export async function enablePush(audience: PushAudience, welcome = true): Promise<{ phase: PushPhase; error?: string }> {
  if (!pushSupported()) return { phase: "unsupported" };
  const permission = await askPermission();
  if (permission !== "granted") return { phase: permission === "denied" ? "denied" : "off" };
  try {
    const publicKey = await getPublicKey();
    const sub = await subscription(publicKey);
    await pushApi.subscribe(audience, sub.toJSON(), welcome);
    store.set(OFF_KEY, null);
    return { phase: "on" };
  } catch (e) {
    return { phase: "off", error: e instanceof Error && e.message ? e.message : "The browser refused." };
  }
}

/** Stops notifications on this browser only. */
export async function disablePush(audience: PushAudience): Promise<void> {
  store.set(OFF_KEY, "1");
  if (!pushSupported()) return;
  const reg = await navigator.serviceWorker.getRegistration(SW_SCOPE);
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    await pushApi.unsubscribe(audience, sub.endpoint).catch(() => undefined);
    await sub.unsubscribe().catch(() => false);
  }
}
