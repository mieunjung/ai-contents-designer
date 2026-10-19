import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const host = "127.0.0.1";
const port = Number(process.env.PORT) || 4173;
const apiKey = process.env.GEMINI_API_KEY;
const model = "gemini-2.5-flash";
const pagePath = fileURLToPath(new URL("./index.html", import.meta.url));
const publicConfigPath = fileURLToPath(new URL("./supabase-config.js", import.meta.url));
const requestsByAddress = new Map();
const requestLimit = 12;
const rateWindowMs = 60_000;

const schemas = {
  game: {
    type: "OBJECT",
    properties: {
      title: { type: "STRING" },
      story: { type: "STRING" },
      heroEmoji: { type: "STRING" },
      collectibleEmoji: { type: "STRING" },
      obstacleEmoji: { type: "STRING" },
      goal: { type: "STRING" }
    },
    required: ["title", "story", "heroEmoji", "collectibleEmoji", "obstacleEmoji", "goal"]
  },
  song: {
    type: "OBJECT",
    properties: {
      mood: { type: "STRING" },
      lyrics: { type: "ARRAY", items: { type: "STRING" } },
      chorus: { type: "STRING" },
      bpm: { type: "INTEGER" },
      notes: { type: "ARRAY", items: { type: "INTEGER" } }
    },
    required: ["mood", "lyrics", "chorus", "bpm", "notes"]
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
            palette: { type: "STRING" }
          },
          required: ["setting", "action", "emoji", "narration", "palette"]
        }
      }
    },
    required: ["logline", "scenes"]
  },
  art: {
    type: "OBJECT",
    properties: {
      description: { type: "STRING" },
      subjectEmoji: { type: "STRING" },
      background: { type: "STRING" },
      subjectColor: { type: "STRING" },
      accentColor: { type: "STRING" },
      details: { type: "ARRAY", items: { type: "STRING" } }
    },
    required: ["description", "subjectEmoji", "background", "subjectColor", "accentColor", "details"]
  }
};

const palettes = {
  ocean: ["#b8e7f5", "#4a9bb8"],
  sunset: ["#ffd3a8", "#e87c83"],
  forest: ["#cce8c5", "#5d9b72"],
  space: ["#d8c9ff", "#8063c9"],
  candy: ["#ffd5e5", "#e783b1"],
  sunny: ["#fff0a8", "#e7a93c"]
};

function sendJson(response, status, value) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  });
  response.end(JSON.stringify(value));
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    let tooLarge = false;
    request.on("data", (chunk) => {
      if (tooLarge) return;
      body += chunk;
      if (body.length > 4_096) {
        tooLarge = true;
      }
    });
    request.on("end", () => {
      if (tooLarge) {
        reject(Object.assign(new Error("요청 내용이 너무 깁니다."), { status: 413 }));
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(Object.assign(new Error("요청 내용을 읽을 수 없습니다."), { status: 400 }));
      }
    });
    request.on("error", reject);
  });
}

function withinRateLimit(address) {
  const now = Date.now();
  const recent = (requestsByAddress.get(address) || []).filter((time) => now - time < rateWindowMs);
  if (recent.length >= requestLimit) {
    requestsByAddress.set(address, recent);
    return false;
  }
  recent.push(now);
  requestsByAddress.set(address, recent);
  return true;
}

function promptFor(category, idea) {
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

function validateResult(category, result) {
  if (!result || typeof result !== "object") throw new Error("Gemini 응답 형식이 올바르지 않습니다.");
  if (category === "game") {
    const fields = ["title", "story", "heroEmoji", "collectibleEmoji", "obstacleEmoji", "goal"];
    if (fields.some((field) => typeof result[field] !== "string" || !result[field].trim())) {
      throw new Error("게임 결과에 필요한 내용이 빠졌습니다. 다시 생성해 주세요.");
    }
    return Object.fromEntries(fields.map((field) => [field, result[field].trim().slice(0, 180)]));
  }
  if (category === "video") {
    if (typeof result.logline !== "string" || !result.logline.trim() || !Array.isArray(result.scenes) || result.scenes.length < 3) {
      throw new Error("영상 결과에 필요한 장면이 부족합니다. 다시 생성해 주세요.");
    }
    const scenes = result.scenes.slice(0, 3).map((scene) => {
      if (!scene || typeof scene !== "object") throw new Error("영상 장면을 읽지 못했습니다. 다시 생성해 주세요.");
      const { setting, action, emoji, narration } = scene;
      if ([setting, action, emoji, narration].some((value) => typeof value !== "string" || !value.trim())) {
        throw new Error("영상 장면 내용이 빠졌습니다. 다시 생성해 주세요.");
      }
      const palette = Object.hasOwn(palettes, scene.palette) ? scene.palette : "ocean";
      return {
        setting: setting.trim().slice(0, 60),
        action: action.trim().slice(0, 100),
        emoji: emoji.trim().slice(0, 16),
        narration: narration.trim().slice(0, 100),
        palette
      };
    });
    return { logline: result.logline.trim().slice(0, 180), scenes };
  }
  if (category === "art") {
    const colorKeys = ["coral", "gold", "mint", "violet", "blue", "pink"];
    if (typeof result.description !== "string" || !result.description.trim() ||
      typeof result.subjectEmoji !== "string" || !result.subjectEmoji.trim() || !Array.isArray(result.details)) {
      throw new Error("그림 결과에 필요한 내용이 빠졌습니다. 다시 생성해 주세요.");
    }
    return {
      description: result.description.trim().slice(0, 180),
      subjectEmoji: result.subjectEmoji.trim().slice(0, 16),
      background: Object.hasOwn(palettes, result.background) ? result.background : "sunset",
      subjectColor: colorKeys.includes(result.subjectColor) ? result.subjectColor : "violet",
      accentColor: colorKeys.includes(result.accentColor) ? result.accentColor : "gold",
      details: result.details.filter((item) => typeof item === "string").slice(0, 4).map((item) => item.trim().slice(0, 40))
    };
  }
  if (typeof result.mood !== "string" || !Array.isArray(result.lyrics) || typeof result.chorus !== "string" || !Array.isArray(result.notes)) {
    throw new Error("노래 결과에 필요한 내용이 빠졌습니다. 다시 생성해 주세요.");
  }
  const lyrics = result.lyrics.filter((line) => typeof line === "string").slice(0, 6).map((line) => line.slice(0, 100));
  const notes = result.notes.slice(0, 16).map(Number).filter((note) => Number.isInteger(note) && note >= 60 && note <= 84);
  if (!lyrics.length || notes.length < 12) throw new Error("노래 가사나 멜로디가 부족합니다. 다시 생성해 주세요.");
  return {
    mood: result.mood.slice(0, 40),
    lyrics,
    chorus: result.chorus.slice(0, 180),
    bpm: Math.max(60, Math.min(160, Math.round(Number(result.bpm) || 100))),
    notes
  };
}

async function generate(category, idea) {
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({
      contents: [{ parts: [{ text: promptFor(category, idea) }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: schemas[category],
        temperature: 0.9,
        maxOutputTokens: 1200
      }
    }),
    signal: AbortSignal.timeout(45_000)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error("Gemini API returned an error:", response.status, data.error?.status || "unknown");
    if (response.status === 429) throw Object.assign(new Error("Gemini 사용량이 잠시 많아요. 조금 뒤에 다시 시도해 주세요."), { status: 429 });
    if (response.status === 400 || response.status === 403) {
      throw Object.assign(new Error("Gemini API 키나 모델 사용 설정을 확인해 주세요."), { status: 502 });
    }
    throw Object.assign(new Error("Gemini에서 작품을 만들지 못했습니다. 잠시 후 다시 시도해 주세요."), { status: 502 });
  }
  const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("").trim();
  if (!text) throw Object.assign(new Error("Gemini가 작품 내용을 반환하지 않았습니다. 다시 시도해 주세요."), { status: 502 });
  let result;
  try {
    result = JSON.parse(text);
  } catch {
    throw Object.assign(new Error("Gemini 응답을 읽지 못했습니다. 다시 시도해 주세요."), { status: 502 });
  }
  return validateResult(category, result);
}

const server = createServer(async (request, response) => {
  const pathname = new URL(request.url, `http://${host}:${port}`).pathname;
  if (request.method === "GET" && pathname === "/api/status") {
    return sendJson(response, 200, { configured: Boolean(apiKey), model });
  }
  if (request.method === "POST" && pathname === "/api/generate") {
    if (!apiKey) return sendJson(response, 503, { error: "서버에 Gemini API 키가 설정되지 않았습니다." });
    if (!withinRateLimit(request.socket.remoteAddress || "local")) {
      return sendJson(response, 429, { error: "잠깐 쉬었다가 다시 만들어 봐요. (1분에 최대 12번)" });
    }
    try {
      const body = await readJson(request);
      if (!body || typeof body !== "object" || Array.isArray(body)) {
        return sendJson(response, 400, { error: "요청 내용이 올바르지 않습니다." });
      }
      if (!["game", "song", "video", "art"].includes(body.category)) return sendJson(response, 400, { error: "지원하지 않는 작품 종류입니다." });
      if (typeof body.idea !== "string" || !body.idea.trim() || body.idea.length > 240) {
        return sendJson(response, 400, { error: "아이디어는 1~240자로 적어 주세요." });
      }
      const result = await generate(body.category, body.idea.trim());
      return sendJson(response, 200, { result, model });
    } catch (error) {
      console.error("작품 생성 요청 실패:", error);
      return sendJson(response, error.status || 502, { error: error.message || "작품을 만들지 못했습니다." });
    }
  }
  if (request.method === "GET" && pathname === "/") {
    try {
      const html = await readFile(pagePath);
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
      return response.end(html);
    } catch (error) {
      console.error("페이지 파일을 읽지 못했습니다.", error);
      return sendJson(response, 500, { error: "페이지 파일을 읽지 못했습니다." });
    }
  }
  if (request.method === "GET" && pathname === "/supabase-config.js") {
    try {
      const script = await readFile(publicConfigPath);
      response.writeHead(200, {
        "Content-Type": "application/javascript; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff"
      });
      return response.end(script);
    } catch (error) {
      console.error("Supabase 공개 설정 파일을 읽지 못했습니다.", error);
      return sendJson(response, 500, { error: "Supabase 공개 설정 파일을 읽지 못했습니다." });
    }
  }
  return sendJson(response, 404, { error: "요청한 주소를 찾을 수 없습니다." });
});

server.listen(port, host, () => {
  console.log(`AI Contents designer: http://${host}:${port}`);
  console.log(`Gemini API key: ${apiKey ? "configured" : "missing"}`);
});
