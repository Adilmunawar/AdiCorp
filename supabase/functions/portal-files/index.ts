// portal-files: file upload and signed-URL access for employee portal sessions.
//
// POST multipart/form-data { token, bucket, kind, file }       -> { path, publicUrl? }
// POST application/json    { token, action: "sign", bucket, path } -> { url }
//
// The portal token is validated by public._portal_resolve_session (service role only),
// which yields the employee and company. Paths are always built or checked server-side;
// ids sent by the client are never trusted.
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-retry-count, x-region",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

const MAX_BYTES = 8 * 1024 * 1024;
const BODY_MAX_BYTES = MAX_BYTES + 64 * 1024;
const SIGNED_URL_TTL_SECONDS = 300;
const TOKEN_PATTERN = /^[0-9a-f]{64}$/;
const KIND_PATTERN = /^[a-z][a-z0-9_-]{1,31}$/;

type FileType = "pdf" | "jpg" | "png" | "webp" | "doc" | "docx";

const FILE_TYPES: Record<FileType, { mime: string; matches: (b: Uint8Array) => boolean }> = {
  pdf: { mime: "application/pdf", matches: (b) => startsWith(b, [0x25, 0x50, 0x44, 0x46]) },
  jpg: { mime: "image/jpeg", matches: (b) => startsWith(b, [0xff, 0xd8, 0xff]) },
  png: { mime: "image/png", matches: (b) => startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) },
  webp: {
    mime: "image/webp",
    matches: (b) => startsWith(b, [0x52, 0x49, 0x46, 0x46]) && startsWith(b.subarray(8), [0x57, 0x45, 0x42, 0x50]),
  },
  doc: { mime: "application/msword", matches: (b) => startsWith(b, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]) },
  docx: {
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    matches: (b) => startsWith(b, [0x50, 0x4b, 0x03, 0x04]),
  },
};

const IMAGE_TYPES: FileType[] = ["jpg", "png", "webp"];
const DOCUMENT_TYPES: FileType[] = ["pdf", "jpg", "png", "webp", "doc", "docx"];
const EXPENSE_KINDS = new Set(["quote", "receipt", "certificate"]);

type UploadBucket = "avatars" | "employee-documents" | "expense-files";
type SignBucket = UploadBucket | "company-files";

interface Session {
  employeeId: string;
  companyId: string;
}

class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

function startsWith(bytes: Uint8Array, signature: number[]): boolean {
  if (bytes.length < signature.length) return false;
  return signature.every((value, index) => bytes[index] === value);
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function adminClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new HttpError(500, "Server is not configured");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function resolveSession(admin: SupabaseClient, token: unknown): Promise<Session> {
  if (typeof token !== "string" || !TOKEN_PATTERN.test(token)) {
    throw new HttpError(401, "invalid session");
  }
  const { data, error } = await admin.rpc("_portal_resolve_session", { p_token: token });
  if (error || !data) throw new HttpError(401, "invalid session");
  const session = data as { employee_id?: string; company_id?: string };
  if (!session.employee_id || !session.company_id) throw new HttpError(401, "invalid session");
  return { employeeId: session.employee_id, companyId: session.company_id };
}

function detectType(bytes: Uint8Array, allowed: FileType[]): FileType {
  const found = allowed.find((type) => FILE_TYPES[type].matches(bytes));
  if (!found) {
    throw new HttpError(415, `Unsupported file type. Allowed: ${allowed.join(", ").toUpperCase()}`);
  }
  return found;
}

function randomSuffix(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function isSafePath(path: string): boolean {
  return (
    path.length > 0 &&
    path.length <= 512 &&
    !path.startsWith("/") &&
    !path.includes("\\") &&
    !path.includes("//") &&
    path.split("/").every((segment) => segment !== "" && segment !== "." && segment !== "..")
  );
}

async function handleUpload(req: Request, admin: SupabaseClient): Promise<Response> {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw new HttpError(400, "Expected multipart form data");
  }

  const session = await resolveSession(admin, form.get("token"));
  const bucket = String(form.get("bucket") ?? "") as UploadBucket;
  const kind = String(form.get("kind") ?? "").toLowerCase();
  const file = form.get("file");

  if (!(file instanceof File)) throw new HttpError(400, "A file is required");
  if (file.size === 0) throw new HttpError(400, "The file is empty");
  if (file.size > MAX_BYTES) throw new HttpError(413, "Files must be 8 MB or smaller");
  if (!KIND_PATTERN.test(kind)) throw new HttpError(400, "Invalid file kind");

  const bytes = new Uint8Array(await file.arrayBuffer());
  const stamp = `${Date.now()}-${randomSuffix()}`;
  const { companyId, employeeId } = session;
  let type: FileType;
  let path: string;

  switch (bucket) {
    case "avatars":
      if (kind !== "avatar") throw new HttpError(400, "Avatars use kind 'avatar'");
      type = detectType(bytes, IMAGE_TYPES);
      path = `${companyId}/${employeeId}/avatar-${stamp}.${type}`;
      break;
    case "employee-documents":
      type = detectType(bytes, DOCUMENT_TYPES);
      path = `${companyId}/${employeeId}/${kind}/${stamp}.${type}`;
      break;
    case "expense-files":
      if (!EXPENSE_KINDS.has(kind)) throw new HttpError(400, "Expense files use kind quote, receipt or certificate");
      type = detectType(bytes, DOCUMENT_TYPES);
      path = `${companyId}/${kind}/${employeeId}/${stamp}.${type}`;
      break;
    default:
      throw new HttpError(403, "Uploads to this bucket are not allowed from the portal");
  }

  const { error } = await admin.storage.from(bucket).upload(path, bytes, {
    contentType: FILE_TYPES[type].mime,
    upsert: false,
  });
  if (error) {
    console.error("portal-files upload failed", { bucket, message: error.message });
    throw new HttpError(500, "Upload failed. Please try again.");
  }

  if (bucket === "avatars") {
    const { data } = admin.storage.from(bucket).getPublicUrl(path);
    return json({ path, publicUrl: data.publicUrl });
  }
  return json({ path });
}

async function canSign(admin: SupabaseClient, session: Session, bucket: SignBucket, path: string): Promise<boolean> {
  const { companyId, employeeId } = session;
  const segments = path.split("/");
  if (segments[0] !== companyId) return false;

  switch (bucket) {
    case "avatars":
      return true;
    case "employee-documents": {
      if (segments[1] === employeeId || (segments.length === 2 && segments[1].startsWith(`${employeeId}-`))) {
        return true;
      }
      const { data } = await admin
        .from("employee_documents")
        .select("id")
        .eq("company_id", companyId)
        .eq("employee_id", employeeId)
        .eq("file_path", path)
        .limit(1);
      return (data?.length ?? 0) > 0;
    }
    case "expense-files":
      return segments.length >= 4 && EXPENSE_KINDS.has(segments[1]) && segments[2] === employeeId;
    case "company-files":
      return segments[1] === "shared" || (segments[1] === "employees" && segments[2] === employeeId);
    default:
      return false;
  }
}

async function handleSign(body: Record<string, unknown>, admin: SupabaseClient): Promise<Response> {
  const session = await resolveSession(admin, body.token);
  const bucket = String(body.bucket ?? "") as SignBucket;
  const path = String(body.path ?? "");

  if (!["avatars", "employee-documents", "expense-files", "company-files"].includes(bucket)) {
    throw new HttpError(403, "This bucket is not available from the portal");
  }
  if (!isSafePath(path)) throw new HttpError(400, "Invalid path");
  if (!(await canSign(admin, session, bucket, path))) throw new HttpError(403, "You do not have access to this file");

  const { data, error } = await admin.storage.from(bucket).createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (error || !data?.signedUrl) throw new HttpError(404, "File not found");
  return json({ url: data.signedUrl });
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const admin = adminClient();
    const contentType = req.headers.get("content-type") ?? "";
    const length = Number(req.headers.get("content-length") ?? "0");
    if (length > BODY_MAX_BYTES) throw new HttpError(413, "Files must be 8 MB or smaller");

    if (contentType.includes("multipart/form-data")) {
      return await handleUpload(req, admin);
    }

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      throw new HttpError(400, "Expected a JSON body");
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new HttpError(400, "Expected a JSON object");
    if (body.action === "sign") return await handleSign(body, admin);
    throw new HttpError(400, "Unknown action");
  } catch (err) {
    if (err instanceof HttpError) return json({ error: err.message }, err.status);
    console.error("portal-files unexpected error", err);
    return json({ error: "Something went wrong" }, 500);
  }
});
