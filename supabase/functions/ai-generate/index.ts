import { createClient } from "npm:@supabase/supabase-js@2";

const allowedOrigins = new Set([
  "https://mieunjung.github.io",
  "http://127.0.0.1:4173",
  "http://localhost:4173",
]);
const model = "gemini-2.5-flash-lite";
const corsHeaders = {
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
  "Vary": "Origin",
  "X-Content-Type-Options": "nosniff",
};

const schemas = {
  game: {
    type: "OBJECT",
    properties: {
      title: { type: "STRING" },
      story: { type: "STRING" },
      heroEmoji: { type: "STRING" },
      collectibleEmoji: { type: "STRING" },
      obstacleEmoji: { type: "STRING" },
      goal: { type: "STRING" },
    },
    required: ["title", "story", "heroEmoji", "collectibleEmoji", "obstacleEmoji", "goal"],
  },
  song: {
    type: "OBJECT",
    properties: {
      mood: { type: "STRING" },
      lyrics: { type: "ARRAY", items: { type: "STRING" } },
      chorus: { type: "STRING" },
      bpm: { type: "INTEGER" },
      notes: { type: "ARRAY", items: { type: "INTEGER" } },
    },
    required: ["mood", "lyrics", "chorus", "bpm", "notes"],
  },
};

function jsonResponse(body: unknown, status = 200, origin?: string) {
  const headers = new Headers(corsHeaders);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  if (origin && allowedOrigins.has(origin)) headers.set("Access-Control-Allow-Origin", origin);
  return new Response(JSON.stringify(body), { status, headers });
}

function promptFor(category: "game" | "song", idea: string) {
  if (category === "game") {
    return `초등학생이 즐길 수 있는 안전하고 귀여운 미니 게임 아이디어를 한국어로 만들어 주세요. 사용자의 아이디어: ${idea}\n규칙: 이야기와 목표는 짧고 긍정적으로 작성하세요. 폭력, 공포, 개인정보를 포함하지 마세요. 이 게임은 버튼을 눌러 아이템을 모으는 클릭 게임입니다.`;
  }
  return `초등학생이 따라 부를 수 있는 짧고 밝은 한국어 노래를 만들어 주세요. 사용자의 아이디어: ${idea}\n규칙: 저작권 있는 노래를 흉내 내지 말고 완전히 새롭게 지어 주세요. lyrics는 짧은 한 줄 가사 4개, chorus는 짧은 후렴 2줄로 만드세요. notes는 C4에서 C6 사이 MIDI 음 번호 8개로, 부드러운 동요 멜로디를 표현하세요. bpm은 80에서 130 사이로 정하세요.`;
}

function validateResult(category: "game" | "song", result: unknown) {
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    throw new Error("Gemini 응답 형식이 올바르지 않습니다.");
  }
  const value = result as Record<string, unknown>;
  if (category === "game") {
    const fields = ["title", "story", "heroEmoji", "collectibleEmoji", "obstacleEmoji", "goal"];
    if (fields.some((field) => typeof value[field] !== "string" || !value[field].trim())) {
      throw new Error("게임 결과에 필요한 내용이 빠졌습니다. 다시 생성해 주세요.");
    }
    return Object.fromEntries(fields.map((field) => [field, (value[field] as string).trim().slice(0, 180)]));
  }
  if (typeof value.mood !== "string" || !Array.isArray(value.lyrics) ||
    typeof value.chorus !== "string" || !Array.isArray(value.notes)) {
    throw new Error("노래 결과에 필요한 내용이 빠졌습니다. 다시 생성해 주세요.");
  }
  const lyrics = value.lyrics.filter((line): line is string => typeof line === "string")
    .slice(0, 6).map((line) => line.slice(0, 100));
  const notes = value.notes.slice(0, 16).map(Number)
    .filter((note) => Number.isInteger(note) && note >= 48 && note <= 96);
  if (!lyrics.length || notes.length < 4) throw new Error("노래 가사나 멜로디가 부족합니다. 다시 생성해 주세요.");
  return {
    mood: value.mood.slice(0, 40),
    lyrics,
    chorus: value.chorus.slice(0, 180),
    bpm: Math.max(60, Math.min(160, Math.round(Number(value.bpm) || 100))),
    notes,
  };
}

async function hashClientAddress(address: string, secret: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${secret}:${address}`));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function generate(category: "game" | "song", idea: string, apiKey: string) {
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({
      contents: [{ parts: [{ text: promptFor(category, idea) }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: schemas[category],
        temperature: 0.8,
        maxOutputTokens: 400,
      },
    }),
    signal: AbortSignal.timeout(45_000),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error("Gemini API error:", response.status, data.error?.status || "unknown");
    if (response.status === 429) {
      throw Object.assign(new Error("Gemini 사용 한도에 도달했어요. 잠시 후 다시 시도해 주세요."), { status: 429 });
    }
    if (response.status === 400 || response.status === 403) {
      throw Object.assign(new Error("Gemini 키와 무료 사용 가능 여부를 확인해 주세요."), { status: 502 });
    }
    throw Object.assign(new Error("Gemini가 작품을 만들지 못했습니다. 잠시 후 다시 시도해 주세요."), { status: 502 });
  }
  const text = data.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text || "").join("").trim();
  if (!text) throw Object.assign(new Error("Gemini가 작품 내용을 반환하지 않았습니다."), { status: 502 });
  let result: unknown;
  try {
    result = JSON.parse(text);
  } catch {
    throw Object.assign(new Error("Gemini 응답을 읽지 못했습니다. 다시 시도해 주세요."), { status: 502 });
  }
  return validateResult(category, result);
}

Deno.serve(async (request) => {
  const origin = request.headers.get("Origin") || undefined;
  if (origin && !allowedOrigins.has(origin)) {
    return jsonResponse({ error: "허용되지 않은 웹사이트입니다." }, 403);
  }
  if (request.method === "OPTIONS") return jsonResponse({ ok: true }, 200, origin);

  const publicKey = Deno.env.get("SUPABASE_ANON_KEY");
  const requestKey = request.headers.get("apikey");
  if (!publicKey || !requestKey || requestKey !== publicKey) {
    return jsonResponse({ error: "Supabase 공개 API 키 인증에 실패했습니다." }, 401, origin);
  }

  const geminiKey = Deno.env.get("GEMINI_API_KEY");
  if (request.method === "GET") {
    return jsonResponse({ configured: Boolean(geminiKey), model }, 200, origin);
  }
  if (request.method !== "POST") {
    return jsonResponse({ error: "지원하지 않는 요청입니다." }, 405, origin);
  }
  if (!geminiKey) return jsonResponse({ error: "Gemini 키가 서버에 설정되지 않았습니다." }, 503, origin);

  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return jsonResponse({ error: "요청 내용을 읽을 수 없습니다." }, 400, origin);
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return jsonResponse({ error: "요청 내용이 올바르지 않습니다." }, 400, origin);
    }
    const { category, idea } = body as Record<string, unknown>;
    if (category !== "game" && category !== "song") {
      return jsonResponse({ error: "게임과 노래만 생성할 수 있습니다." }, 400, origin);
    }
    if (typeof idea !== "string" || !idea.trim() || idea.length > 240) {
      return jsonResponse({ error: "아이디어는 1~240자로 적어 주세요." }, 400, origin);
    }

    const clientAddress = request.headers.get("cf-connecting-ip") ||
      request.headers.get("x-real-ip");
    if (!clientAddress) {
      console.error("Trusted client IP header is missing; refusing generation without quota enforcement.");
      return jsonResponse({ error: "생성 사용 한도를 확인할 수 없습니다." }, 503, origin);
    }
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      console.error("Supabase service role environment is missing.");
      return jsonResponse({ error: "서버 설정이 완료되지 않았습니다." }, 503, origin);
    }
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: quota, error: quotaError } = await admin.rpc("consume_ai_generation_quota", {
      p_client_hash: await hashClientAddress(clientAddress, serviceRoleKey),
    });
    if (quotaError) {
      console.error("Generation quota check failed:", quotaError.message);
      return jsonResponse({ error: "생성 한도 확인에 실패했습니다. 관리자에게 문의해 주세요." }, 503, origin);
    }
    if (quota === "daily_limit") {
      return jsonResponse({ error: "오늘 사이트의 전체 작품 생성 한도에 도달했어요. 내일 다시 만나요!" }, 429, origin);
    }
    if (quota === "client_limit") {
      return jsonResponse({ error: "하루 생성 횟수(기기당 8회)를 다 사용했어요. 내일 다시 만들어요!" }, 429, origin);
    }
    if (quota !== "ok") {
      console.error("Unexpected quota response:", quota);
      return jsonResponse({ error: "생성 한도를 확인하지 못했습니다." }, 503, origin);
    }

    const result = await generate(category, idea.trim(), geminiKey);
    return jsonResponse({ result, model }, 200, origin);
  } catch (error) {
    console.error("Generation request failed:", error);
    const status = error instanceof Error && "status" in error ? Number(error.status) : 502;
    const message = error instanceof Error ? error.message : "작품을 만들지 못했습니다.";
    return jsonResponse({ error: message }, status, origin);
  }
});
