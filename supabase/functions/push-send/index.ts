// push-send: Web Push delivery for AdiCorp notifications (no third-party push service).
//
// POST { action: "public_key" }                       -> { publicKey }   (anyone; generates the VAPID pair once)
// POST { notification_id } + header x-push-secret     -> { sent, failed, removed }
//      Called only by the database (trigger public.tg_notifications_push via pg_net) with the
//      shared secret kept in engagement_private.config. The row is read here with the service
//      role, so nothing in the request body is trusted beyond the id.
//
// Messages are encrypted per device (RFC 8291, aes128gcm content coding of RFC 8188) and signed
// with the site's VAPID key (RFC 8292). Dead subscriptions are pruned. Deployed with verify_jwt=true:
// the browser calls it through supabase-js (session or anon JWT) and the database trigger sends the
// project's anon JWT (engagement_private.config.function_key) in Authorization. The anon JWT only gets
// a request past the gateway; delivery still requires the x-push-secret shared secret.
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-retry-count, x-region",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

/** The origin to allow: one listed in ALLOWED_ORIGINS (comma separated), or "*" when it is unset. */
function allowOrigin(req: Request): string {
  const allowed = (Deno.env.get("ALLOWED_ORIGINS") ?? "")
    .split(",")
    .map((o) => o.trim().replace(/\/+$/, ""))
    .filter(Boolean);
  if (allowed.length === 0) return "*";
  const origin = (req.headers.get("origin") ?? "").replace(/\/+$/, "");
  return allowed.includes(origin) ? origin : allowed[0];
}

function withCors(res: Response, req: Request): Response {
  res.headers.set("Access-Control-Allow-Origin", allowOrigin(req));
  res.headers.append("Vary", "Origin");
  return res;
}

const admin = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", {
  auth: { persistSession: false, autoRefreshToken: false },
});

/** A push service holds a message this long for a device that is switched off. */
const TTL_SECONDS = 2 * 86_400;
/** Push services accept 4096 bytes; encryption adds 103, so the JSON stays well under. */
const MAX_PLAINTEXT = 3000;
/** A device failing this many sends in a row is dropped. */
const MAX_FAILURES = 10;
const CONCURRENCY = 6;
/** Lock-screen privacy: these kinds are pushed with the title only. */
const PRIVATE_KINDS = ["complaint", "notice", "letter", "payroll", "payslip", "salary", "expense"];
/** Only the real push services, so the server never posts anywhere else. */
const PUSH_HOSTS = [
  /^fcm\.googleapis\.com$/,
  /^android\.googleapis\.com$/,
  /(^|\.)push\.services\.mozilla\.com$/,
  /(^|\.)notify\.windows\.com$/,
  /(^|\.)push\.apple\.com$/,
];

interface PushConfig {
  webhook_secret: string;
  vapid_public: string | null;
  vapid_private: { x: string; y: string; d: string } | null;
  vapid_subject: string;
}

interface NotificationRow {
  id: string;
  user_id: string | null;
  employee_id: string | null;
  kind: string;
  title: string;
  body: string | null;
  href: string | null;
  created_at: string;
}

interface Subscription {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  failures: number;
}

const encoder = new TextEncoder();

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
}

/* ------------------------------------------------------------------ bytes */

function b64uEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64uDecode(value: string): Uint8Array {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/").replace(/=+$/, "");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

function timingSafeEqual(a: string, b: string): boolean {
  const x = encoder.encode(a);
  const y = encoder.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

/* ----------------------------------------------------------------- config */

let cachedConfig: { value: PushConfig; at: number } | null = null;

async function loadConfig(fresh = false): Promise<PushConfig> {
  if (!fresh && cachedConfig && Date.now() - cachedConfig.at < 5 * 60_000) return cachedConfig.value;
  const { data, error } = await admin.rpc("_push_config");
  if (error || !data) throw new Error(`config unavailable: ${error?.message ?? "empty"}`);
  cachedConfig = { value: data as PushConfig, at: Date.now() };
  return cachedConfig.value;
}

/** The site's VAPID key pair, generated and stored once (the private key never leaves the server). */
async function vapidKeys(): Promise<{ publicKey: string; jwk: { x: string; y: string; d: string } }> {
  let config = await loadConfig();
  if (config.vapid_public && config.vapid_private?.d) return { publicKey: config.vapid_public, jwk: config.vapid_private };

  const pair = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"])) as CryptoKeyPair;
  const jwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
  const raw = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
  const privateJwk = { kty: "EC", crv: "P-256", x: jwk.x!, y: jwk.y!, d: jwk.d! };
  const { error } = await admin.rpc("_push_store_vapid", { p_public: b64uEncode(raw), p_private: privateJwk });
  if (error) throw new Error(`could not store keys: ${error.message}`);
  // Another instance may have won the race: always use what is stored.
  config = await loadConfig(true);
  if (!config.vapid_public || !config.vapid_private?.d) throw new Error("keys missing after store");
  return { publicKey: config.vapid_public, jwk: config.vapid_private };
}

/* ------------------------------------------------------------- encryption */

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, key, length * 8));
}

/** RFC 8291: a fresh key pair and salt per message, so no two messages share a key. */
async function encryptPayload(plaintext: Uint8Array, p256dh: string, authSecret: string): Promise<Uint8Array> {
  const uaPublic = b64uDecode(p256dh);
  const auth = b64uDecode(authSecret);
  if (uaPublic.length !== 65 || uaPublic[0] !== 4 || auth.length !== 16) throw new Error("bad subscription keys");

  const uaKey = await crypto.subtle.importKey("raw", uaPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const local = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])) as CryptoKeyPair;
  const asPublic = new Uint8Array(await crypto.subtle.exportKey("raw", local.publicKey));
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, local.privateKey, 256));

  const keyInfo = concat(encoder.encode("WebPush: info\0"), uaPublic, asPublic);
  const ikm = await hkdf(auth, shared, keyInfo, 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, encoder.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, encoder.encode("Content-Encoding: nonce\0"), 12);

  const aesKey = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  // One record: the text, then the 0x02 delimiter that marks the last record.
  const sealed = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce, tagLength: 128 }, aesKey, concat(plaintext, new Uint8Array([2]))),
  );
  const header = new Uint8Array(21);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, 4096);
  header[20] = asPublic.length;
  return concat(header, asPublic, sealed);
}

/** The Authorization header for one push service: a token signed with the site key, valid 12 hours. */
async function vapidHeader(endpoint: string, keys: { publicKey: string; jwk: { x: string; y: string; d: string } }, subject: string): Promise<string> {
  const header = b64uEncode(encoder.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = b64uEncode(
    encoder.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject })),
  );
  const key = await crypto.subtle.importKey(
    "jwk",
    { kty: "EC", crv: "P-256", x: keys.jwk.x, y: keys.jwk.y, d: keys.jwk.d, ext: true },
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  // WebCrypto returns the raw r||s (IEEE P1363) signature JWS expects.
  const signature = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, encoder.encode(`${header}.${claims}`)));
  return `vapid t=${header}.${claims}.${b64uEncode(signature)}, k=${keys.publicKey}`;
}

function allowedEndpoint(endpoint: string): boolean {
  try {
    const url = new URL(endpoint);
    if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) return false;
    return PUSH_HOSTS.some((re) => re.test(url.hostname.toLowerCase()));
  } catch {
    return false;
  }
}

/* --------------------------------------------------------------- delivery */

function buildPayload(n: NotificationRow): Uint8Array {
  const portal = !!n.employee_id;
  const fallback = portal ? "/portal" : "/notifications";
  const url = n.href && n.href.startsWith("/") && !n.href.startsWith("//") ? n.href : fallback;
  const hideBody = PRIVATE_KINDS.some((k) => n.kind === k || n.kind.startsWith(`${k}.`) || n.kind.startsWith(`${k}_`));
  const message = {
    title: n.title,
    body: hideBody ? "" : n.body ?? "",
    url,
    // Conversation pushes replace each other on the device; everything else stacks.
    tag: n.kind === "message" ? `message:${url}`.slice(0, 120) : undefined,
    nid: n.id,
    at: Date.parse(n.created_at) || Date.now(),
    audience: portal ? "portal" : "staff",
  };
  let bytes = encoder.encode(JSON.stringify(message));
  while (bytes.length > MAX_PLAINTEXT && message.body.length > 0) {
    message.body = `${message.body.slice(0, Math.max(0, message.body.length - 200))}…`;
    if (message.body.length <= 1) message.body = "";
    bytes = encoder.encode(JSON.stringify(message));
  }
  return bytes;
}

type Outcome = { id: string; result: "ok" | "gone" | "failed"; detail?: string; failures: number };

async function sendOne(sub: Subscription, payload: Uint8Array, keys: { publicKey: string; jwk: { x: string; y: string; d: string } }, subject: string): Promise<Outcome> {
  if (!allowedEndpoint(sub.endpoint)) return { id: sub.id, result: "gone", detail: "endpoint not allowed", failures: sub.failures };
  try {
    const body = await encryptPayload(payload, sub.p256dh, sub.auth);
    const res = await fetch(sub.endpoint, {
      method: "POST",
      headers: {
        Authorization: await vapidHeader(sub.endpoint, keys, subject),
        "Content-Encoding": "aes128gcm",
        "Content-Type": "application/octet-stream",
        TTL: String(TTL_SECONDS),
        Urgency: "high",
      },
      body,
      redirect: "manual",
      signal: AbortSignal.timeout(8000),
    });
    await res.body?.cancel().catch(() => undefined);
    if (res.status >= 200 && res.status < 300) return { id: sub.id, result: "ok", failures: 0 };
    if ([401, 403, 404, 410].includes(res.status)) return { id: sub.id, result: "gone", detail: `HTTP ${res.status}`, failures: sub.failures };
    return { id: sub.id, result: "failed", detail: `HTTP ${res.status}`, failures: sub.failures + 1 };
  } catch (e) {
    const detail = e instanceof Error ? e.message.slice(0, 200) : "send failed";
    if (detail === "bad subscription keys") return { id: sub.id, result: "gone", detail, failures: sub.failures };
    return { id: sub.id, result: "failed", detail, failures: sub.failures + 1 };
  }
}

async function record(outcomes: Outcome[]): Promise<{ sent: number; failed: number; removed: number }> {
  const now = new Date().toISOString();
  const ok = outcomes.filter((o) => o.result === "ok").map((o) => o.id);
  const gone = outcomes.filter((o) => o.result === "gone" || (o.result === "failed" && o.failures >= MAX_FAILURES)).map((o) => o.id);
  const failed = outcomes.filter((o) => o.result === "failed" && o.failures < MAX_FAILURES);

  if (ok.length) await admin.from("push_subscriptions").update({ last_ok_at: now, failures: 0, last_error: null }).in("id", ok);
  if (gone.length) await admin.from("push_subscriptions").delete().in("id", gone);
  await Promise.all(
    failed.map((o) => admin.from("push_subscriptions").update({ failures: o.failures, last_error: o.detail ?? "send failed" }).eq("id", o.id)),
  );
  return { sent: ok.length, failed: failed.length, removed: gone.length };
}

async function deliver(notificationId: string): Promise<Response> {
  const { data: row, error } = await admin
    .from("notifications")
    .select("id, user_id, employee_id, kind, title, body, href, created_at")
    .eq("id", notificationId)
    .maybeSingle();
  if (error) return json({ error: "lookup failed" }, 500);
  const n = row as NotificationRow | null;
  if (!n) return json({ sent: 0, skipped: "not found" });

  let query = admin.from("push_subscriptions").select("id, endpoint, p256dh, auth, failures");
  if (n.user_id) query = query.eq("user_id", n.user_id);
  else if (n.employee_id) query = query.eq("employee_id", n.employee_id);
  else return json({ sent: 0, skipped: "no recipient" });
  const { data: subs, error: subsError } = await query.limit(20);
  if (subsError) return json({ error: "subscriptions unavailable" }, 500);
  if (!subs?.length) return json({ sent: 0 });

  const config = await loadConfig();
  const keys = await vapidKeys();
  const payload = buildPayload(n);
  const outcomes: Outcome[] = [];
  const queue = [...(subs as Subscription[])];
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
      for (let sub = queue.shift(); sub; sub = queue.shift()) outcomes.push(await sendOne(sub, payload, keys, config.vapid_subject));
    }),
  );
  return json(await record(outcomes));
}

async function handle(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "Bad request" }, 400);

  try {
    if (body.action === "public_key") {
      const keys = await vapidKeys();
      return json({ publicKey: keys.publicKey });
    }

    const id = typeof body.notification_id === "string" ? body.notification_id : "";
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return json({ error: "Bad request" }, 400);
    const config = await loadConfig();
    const secret = req.headers.get("x-push-secret") ?? "";
    if (!secret || !timingSafeEqual(secret, config.webhook_secret)) return json({ error: "Forbidden" }, 403);
    return await deliver(id);
  } catch (e) {
    console.error("push-send", e instanceof Error ? e.message : e);
    return json({ error: "Push delivery failed" }, 500);
  }
}

Deno.serve(async (req: Request): Promise<Response> => withCors(await handle(req), req));
