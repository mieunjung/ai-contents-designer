import { createClient } from "npm:@supabase/supabase-js@2";

const allowedOrigins = new Set([
  "https://mieunjung.github.io",
  "http://127.0.0.1:4173",
  "http://localhost:4173",
]);
const bucket = "scratch-projects";
const maxFileBytes = 50 * 1024 * 1024;
const categories = new Set(["video", "game", "song", "art"]);
const corsHeaders = {
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
  "Vary": "Origin",
  "X-Content-Type-Options": "nosniff",
};

function jsonResponse(body: unknown, status = 200, origin?: string) {
  const headers = new Headers(corsHeaders);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  if (origin && allowedOrigins.has(origin)) headers.set("Access-Control-Allow-Origin", origin);
  return new Response(JSON.stringify(body), { status, headers });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

async function hashClientAddress(address: string, secret: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${secret}:${address}`));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (request) => {
  const origin = request.headers.get("Origin") || undefined;
  if (origin && !allowedOrigins.has(origin)) {
    return jsonResponse({ error: "허용되지 않은 웹사이트입니다." }, 403, origin);
  }
  if (request.method === "OPTIONS") return jsonResponse({ ok: true }, 200, origin);
  if (request.method !== "POST") {
    return jsonResponse({ error: "지원하지 않는 요청입니다." }, 405, origin);
  }

  const publicKey = Deno.env.get("SUPABASE_ANON_KEY");
  const requestKey = request.headers.get("apikey");
  if (!publicKey || !requestKey || requestKey !== publicKey) {
    return jsonResponse({ error: "Supabase 공개 API 키 인증에 실패했습니다." }, 401, origin);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("Supabase service role environment is missing.");
    return jsonResponse({ error: "서버 설정이 완료되지 않았습니다." }, 503, origin);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "요청 내용을 읽을 수 없습니다." }, 400, origin);
  }
  if (!isRecord(body) || (body.action !== "prepare" && body.action !== "finalize")) {
    return jsonResponse({ error: "요청 내용이 올바르지 않습니다." }, 400, origin);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  if (body.action === "prepare") {
    const {
      title,
      content,
      fileName,
      fileSize,
      category = "game",
      uploader = "스크래치 게임",
    } = body;
    if (typeof title !== "string" || !title.trim() || title.trim().length > 50) {
      return jsonResponse({ error: "작품 제목은 1~50자로 입력해 주세요." }, 400, origin);
    }
    if (typeof content !== "string" || !content.trim() || content.trim().length > 500) {
      return jsonResponse({ error: "작품 소개는 1~500자로 입력해 주세요." }, 400, origin);
    }
    if (typeof category !== "string" || !categories.has(category)) {
      return jsonResponse({ error: "작품 분야를 확인해 주세요." }, 400, origin);
    }
    if (typeof uploader !== "string" || !uploader.trim() || uploader.trim().length > 20) {
      return jsonResponse({ error: "올린이 이름은 1~20자로 입력해 주세요." }, 400, origin);
    }
    if (
      typeof fileName !== "string" ||
      !fileName.trim() ||
      fileName.trim().length > 180 ||
      /[\/\\\u0000-\u001f\u007f]/.test(fileName)
    ) {
      return jsonResponse({ error: "첨부 파일 이름을 확인해 주세요." }, 400, origin);
    }
    if (!Number.isSafeInteger(fileSize) || Number(fileSize) < 1 || Number(fileSize) > maxFileBytes) {
      return jsonResponse({ error: "파일 크기는 1바이트 이상, 50MB 이하만 허용됩니다." }, 413, origin);
    }

    const clientAddress = request.headers.get("cf-connecting-ip") ||
      request.headers.get("x-real-ip");
    if (!clientAddress) {
      console.error("Trusted client IP header is missing; refusing upload without quota enforcement.");
      return jsonResponse({ error: "업로드 사용 한도를 확인할 수 없습니다." }, 503, origin);
    }

    const { data: quota, error: quotaError } = await admin.rpc("consume_scratch_upload_quota", {
      p_client_hash: await hashClientAddress(clientAddress, serviceRoleKey),
    });
    if (quotaError) {
      console.error("Board attachment quota check failed:", quotaError.message);
      return jsonResponse({ error: "업로드 한도 확인에 실패했습니다." }, 503, origin);
    }
    if (quota === "daily_limit") {
      return jsonResponse({ error: "오늘 사이트의 전체 첨부 파일 업로드 한도에 도달했어요." }, 429, origin);
    }
    if (quota === "client_limit") {
      return jsonResponse({ error: "하루 업로드 횟수(IP 기준 10회)를 다 사용했어요. 내일 다시 시도해 주세요." }, 429, origin);
    }
    if (quota !== "ok") {
      console.error("Unexpected board attachment quota response:", quota);
      return jsonResponse({ error: "업로드 한도를 확인하지 못했습니다." }, 503, origin);
    }

    const path = crypto.randomUUID();
    const { data, error } = await admin.storage.from(bucket).createSignedUploadUrl(path, { upsert: false });
    if (error) {
      console.error("Could not create signed board attachment upload URL:", error.message);
      return jsonResponse({ error: "업로드 주소를 만들지 못했습니다. 잠시 후 다시 시도해 주세요." }, 503, origin);
    }
    return jsonResponse({ path, token: data.token }, 200, origin);
  }

  const {
    path,
    title,
    content,
    category = "game",
    uploader = "스크래치 게임",
    fileName = "Scratch project.sb3",
    fileSize,
  } = body;
  if (
    typeof path !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(\.sb3)?$/.test(path)
  ) {
    return jsonResponse({ error: "업로드 파일 정보를 확인할 수 없습니다." }, 400, origin);
  }
  if (typeof title !== "string" || !title.trim() || title.trim().length > 50) {
    return jsonResponse({ error: "작품 제목을 확인해 주세요." }, 400, origin);
  }
  if (typeof content !== "string" || !content.trim() || content.trim().length > 500) {
    return jsonResponse({ error: "작품 소개를 확인해 주세요." }, 400, origin);
  }
  if (typeof category !== "string" || !categories.has(category)) {
    return jsonResponse({ error: "작품 분야를 확인해 주세요." }, 400, origin);
  }
  if (typeof uploader !== "string" || !uploader.trim() || uploader.trim().length > 20) {
    return jsonResponse({ error: "올린이 이름은 1~20자로 입력해 주세요." }, 400, origin);
  }
  if (
    typeof fileName !== "string" ||
    !fileName.trim() ||
    fileName.trim().length > 180 ||
    /[\/\\\u0000-\u001f\u007f]/.test(fileName)
  ) {
    return jsonResponse({ error: "첨부 파일 이름을 확인해 주세요." }, 400, origin);
  }
  if (
    fileSize !== undefined &&
    (!Number.isSafeInteger(fileSize) || Number(fileSize) < 1 || Number(fileSize) > maxFileBytes)
  ) {
    return jsonResponse({ error: "파일 크기는 1바이트 이상, 50MB 이하만 허용됩니다." }, 413, origin);
  }

  const { data: files, error: listError } = await admin.storage.from(bucket).list("", {
    limit: 1,
    search: path,
  });
  if (listError) {
    console.error("Could not verify uploaded board attachment:", listError.message);
    return jsonResponse({ error: "업로드 파일을 확인하지 못했습니다." }, 503, origin);
  }
  const uploadedFile = files.find((file) => file.name === path);
  const uploadedSize = Number(uploadedFile?.metadata?.size);
  if (
    !uploadedFile ||
    !Number.isFinite(uploadedSize) ||
    (typeof fileSize === "number" && uploadedSize !== fileSize) ||
    uploadedSize < 1 ||
    uploadedSize > maxFileBytes
  ) {
    return jsonResponse({ error: "업로드된 첨부 파일을 찾을 수 없거나 파일 크기가 일치하지 않습니다." }, 400, origin);
  }

  const { data: post, error: insertError } = await admin
    .from("board_posts")
    .insert({
      uploader: uploader.trim(),
      file_name: fileName.trim(),
      category,
      title: title.trim(),
      content: content.trim(),
      file_path: path,
    })
    .select("id, category, title, content, uploader, file_name, created_at, file_path")
    .single();
  if (insertError) {
    const { data: existingPost, error: lookupError } = await admin
      .from("board_posts")
      .select("id, category, title, content, uploader, file_name, created_at, file_path")
      .eq("file_path", path)
      .maybeSingle();
    if (lookupError) {
      console.error("Could not check for an existing Scratch board post:", lookupError.message);
      return jsonResponse({ error: "저장 결과를 확인하지 못했습니다. 게시판을 새로고침해 주세요." }, 503, origin);
    }
    if (existingPost) return jsonResponse({ post: existingPost }, 200, origin);

    console.error("Could not save Scratch board post:", insertError.message);
    const { error: removeError } = await admin.storage.from(bucket).remove([path]);
    if (removeError) console.error("Could not remove unlisted Scratch upload:", removeError.message);
    return jsonResponse({ error: "작품 정보를 저장하지 못했습니다. 다시 시도해 주세요." }, 503, origin);
  }

  return jsonResponse({ post }, 201, origin);
});
