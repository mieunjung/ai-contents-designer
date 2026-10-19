import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const host = "127.0.0.1";
const port = Number(process.env.PORT) || 4173;
const apiKey = process.env.GEMINI_API_KEY;
const model = "gemini-2.5-flash-lite";
const pagePath = fileURLToPath(new URL("./index.html", import.meta.url));
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
  }
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
  if (category === "game") {
    return `초등학생이 즐길 수 있는 안전하고 귀여운 미니 게임 아이디어를 한국어로 만들어 주세요. 사용자의 아이디어: ${idea}\n규칙: 이야기와 목표는 짧고 긍정적으로 작성하세요. 폭력, 공포, 개인정보를 포함하지 마세요. 이 게임은 버튼을 눌러 아이템을 모으는 클릭 게임입니다.`;
  }
  return `초등학생이 따라 부를 수 있는 짧고 밝은 한국어 노래를 만들어 주세요. 사용자의 아이디어: ${idea}\n규칙: 저작권 있는 노래를 흉내 내지 말고 완전히 새롭게 지어 주세요. lyrics는 짧은 한 줄 가사 4개, chorus는 짧은 후렴 2줄로 만드세요. notes는 C4에서 C6 사이 MIDI 음 번호 8개로, 부드러운 동요 멜로디를 표현하세요. bpm은 80에서 130 사이로 정하세요.`;
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
  if (typeof result.mood !== "string" || !Array.isArray(result.lyrics) || typeof result.chorus !== "string" || !Array.isArray(result.notes)) {
    throw new Error("노래 결과에 필요한 내용이 빠졌습니다. 다시 생성해 주세요.");
  }
  const lyrics = result.lyrics.filter((line) => typeof line === "string").slice(0, 6).map((line) => line.slice(0, 100));
  const notes = result.notes.slice(0, 16).map(Number).filter((note) => Number.isInteger(note) && note >= 48 && note <= 96);
  if (!lyrics.length || notes.length < 4) throw new Error("노래 가사나 멜로디가 부족합니다. 다시 생성해 주세요.");
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
        temperature: 0.8,
        maxOutputTokens: 400
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
      if (!["game", "song"].includes(body.category)) return sendJson(response, 400, { error: "지원하지 않는 작품 종류입니다." });
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
  return sendJson(response, 404, { error: "요청한 주소를 찾을 수 없습니다." });
});

server.listen(port, host, () => {
  console.log(`AI Contents designer: http://${host}:${port}`);
  console.log(`Gemini API key: ${apiKey ? "configured" : "missing"}`);
});
