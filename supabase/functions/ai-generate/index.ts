import { createClient } from "npm:@supabase/supabase-js@2";

const allowedOrigins = new Set([
  "https://mieunjung.github.io",
  "http://127.0.0.1:4173",
  "http://localhost:4173",
]);
const model = "gemini-2.5-flash";
const corsHeaders = {
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
  "Vary": "Origin",
  "X-Content-Type-Options": "nosniff",
};

const palettes: Record<string, string[]> = {
  ocean: ["#b8e7f5", "#4a9bb8"],
  sunset: ["#ffd3a8", "#e87c83"],
  forest: ["#cce8c5", "#5d9b72"],
  space: ["#d8c9ff", "#8063c9"],
  candy: ["#ffd5e5", "#e783b1"],
  sunny: ["#fff0a8", "#e7a93c"],
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
  video: {
    type: "OBJECT",
    properties: {
      logline: { type: "STRING" },
      scenes: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: {
            setting: { type: "STRING" },
            action: { type: "STRING" },
            emoji: { type: "STRING" },
            narration: { type: "STRING" },
            palette: { type: "STRING" },
          },
          required: ["setting", "action", "emoji", "narration", "palette"],
        },
      },
    },
    required: ["logline", "scenes"],
  },
  art: {
    type: "OBJECT",
    properties: {
      description: { type: "STRING" },
      subjectEmoji: { type: "STRING" },
      background: { type: "STRING" },
      subjectColor: { type: "STRING" },
      accentColor: { type: "STRING" },
      details: { type: "ARRAY", items: { type: "STRING" } },
    },
    required: ["description", "subjectEmoji", "background", "subjectColor", "accentColor", "details"],
  },
};

function jsonResponse(body: unknown, status = 200, origin?: string) {
  const headers = new Headers(corsHeaders);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  if (origin && allowedOrigins.has(origin)) headers.set("Access-Control-Allow-Origin", origin);
  return new Response(JSON.stringify(body), { status, headers });
}

function promptFor(category: "game" | "song" | "video" | "art", idea: string) {
  const creativeBrief = `사용자 아이디어를 핵심 소재로 삼고 단순히 되풀이하지 말고 기억에 남는 한 가지 장면과 감정을 더해 주세요. 어린이가 이해하기 쉬운 자연스러운 한국어를 사용하고, 짧지만 구체적으로 완성하세요. 안전하고 다정한 내용으로 만들며 개인정보, 폭력, 공포는 제외하세요.\n아이디어: ${idea}\n`;
  if (category === "game") {
    return `${creativeBrief}아이디어를 바탕으로 실제로 바로 해볼 수 있는 클릭형 미니 게임을 설계하세요. title은 재미있는 짧은 제목, story는 주인공이 무엇을 하며 왜 하는지 드러나는 한두 문장, goal은 달성 여부를 알 수 있는 목표로 만드세요. 주인공·수집 아이템·장애물 이모지는 이야기와 서로 어울리게 고르세요.`;
  }
  if (category === "song") {
    return `${creativeBrief}저작권 있는 노래, 가수, 기존 노래의 문구나 멜로디를 따라 하지 말고 완전히 새로운 짧은 동요를 만드세요. mood에는 밝기와 분위기를 간결하게 적으세요. lyrics는 이야기가 시작-전개-마무리로 이어지는 짧고 운율감 있는 4행, chorus는 귀에 남고 함께 부르기 쉬운 후렴 2행으로 쓰세요. 같은 단어를 억지로 반복하지 말고 아이디어의 핵심 이미지를 가사에 살리세요. notes는 C4~C6 범위(MIDI 60~84)의 정수 음 16개로, 앞 8개는 가사 부분, 뒤 8개는 더 신나고 기억하기 쉬운 후렴 멜로디로 표현하세요. bpm은 90~125 사이로 정하세요.`;
  }
  if (category === "video") {
    return `${creativeBrief}짧은 동화 예고편처럼 기승전결이 또렷한 3장면 영상 스토리보드를 만드세요. 첫 장면은 장소와 주인공을 인상적으로 소개하고, 둘째는 작은 발견이나 도전을 보여주며, 셋째는 따뜻하고 만족스러운 해결로 끝내세요. 각 setting은 화면에 그려질 장소와 시간대를 구체적으로, action은 한눈에 보이는 움직임 하나를, emoji는 주인공을 알아볼 수 있는 이모지 1~2개를, narration은 짧고 자연스러운 한 문장을 사용하세요. 장면의 palette는 ocean, sunset, forest, space, candy, sunny 중 이야기와 어울리는 키 하나를 선택하세요.`;
  }
  return `${creativeBrief}그림책 표지처럼 주인공이 또렷하고 색의 대비가 좋은 한 장면을 설계하세요. description에는 주인공의 표정·행동·배경이 함께 그려지도록 짧게 설명하세요. subjectEmoji는 이야기의 주인공을 나타내는 이모지 1~2개로 고르고, 배경색 background는 ocean, sunset, forest, space, candy, sunny 중 하나, subjectColor와 accentColor는 coral, gold, mint, violet, blue, pink 중 이야기와 조화로운 키로 선택하세요. details에는 장면에 실제로 어울리는 짧은 장식 2~4개를 넣으세요.`;
}

function validateResult(category: "game" | "song" | "video" | "art", result: unknown) {
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
  if (category === "video") {
    if (typeof value.logline !== "string" || !value.logline.trim() || !Array.isArray(value.scenes) || value.scenes.length < 3) {
      throw new Error("영상 결과에 필요한 장면이 부족합니다. 다시 생성해 주세요.");
    }
    const scenes = value.scenes.slice(0, 3).map((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        throw new Error("영상 장면을 읽지 못했습니다. 다시 생성해 주세요.");
      }
      const scene = entry as Record<string, unknown>;
      const fields = ["setting", "action", "emoji", "narration"];
      if (fields.some((field) => typeof scene[field] !== "string" || !(scene[field] as string).trim())) {
        throw new Error("영상 장면 내용이 빠졌습니다. 다시 생성해 주세요.");
      }
      const palette = typeof scene.palette === "string" && Object.hasOwn(palettes, scene.palette)
        ? scene.palette
        : "ocean";
      return {
        setting: (scene.setting as string).trim().slice(0, 60),
        action: (scene.action as string).trim().slice(0, 100),
        emoji: (scene.emoji as string).trim().slice(0, 16),
        narration: (scene.narration as string).trim().slice(0, 100),
        palette,
      };
    });
    return { logline: value.logline.trim().slice(0, 180), scenes };
  }
  if (category === "art") {
    const colorKeys = ["coral", "gold", "mint", "violet", "blue", "pink"];
    if (typeof value.description !== "string" || !value.description.trim() ||
      typeof value.subjectEmoji !== "string" || !value.subjectEmoji.trim() || !Array.isArray(value.details)) {
      throw new Error("그림 결과에 필요한 내용이 빠졌습니다. 다시 생성해 주세요.");
    }
    return {
      description: value.description.trim().slice(0, 180),
      subjectEmoji: value.subjectEmoji.trim().slice(0, 16),
      background: typeof value.background === "string" && Object.hasOwn(palettes, value.background) ? value.background : "sunset",
      subjectColor: colorKeys.includes(String(value.subjectColor)) ? String(value.subjectColor) : "violet",
      accentColor: colorKeys.includes(String(value.accentColor)) ? String(value.accentColor) : "gold",
      details: value.details.filter((item): item is string => typeof item === "string").slice(0, 4).map((item) => item.trim().slice(0, 40)),
    };
  }
  if (typeof value.mood !== "string" || !Array.isArray(value.lyrics) ||
    typeof value.chorus !== "string" || !Array.isArray(value.notes)) {
    throw new Error("노래 결과에 필요한 내용이 빠졌습니다. 다시 생성해 주세요.");
  }
  const lyrics = value.lyrics.filter((line): line is string => typeof line === "string")
    .slice(0, 6).map((line) => line.slice(0, 100));
  const notes = value.notes.slice(0, 16).map(Number)
    .filter((note) => Number.isInteger(note) && note >= 60 && note <= 84);
  if (!lyrics.length || notes.length < 12) throw new Error("노래 가사나 멜로디가 부족합니다. 다시 생성해 주세요.");
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

async function generate(category: "game" | "song" | "video" | "art", idea: string, apiKey: string) {
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({
      contents: [{ parts: [{ text: promptFor(category, idea) }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: schemas[category],
        temperature: 0.9,
        maxOutputTokens: 1200,
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

  const publicKey = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY");
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
    if (category !== "game" && category !== "song" && category !== "video" && category !== "art") {
      return jsonResponse({ error: "지원하지 않는 작품 종류입니다." }, 400, origin);
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
