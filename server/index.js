const MODEL = "gemini-3.8-flash";
const MAX_TEXT_CHARS = 120000;
const MAX_AUDIO_BYTES = 4 * 1024 * 1024;
const MAX_AUDIO_BASE64_CHARS = Math.ceil(MAX_AUDIO_BYTES * 4 / 3) + 16;
const MAX_OUTPUT_TOKENS = 2400;
const WINDOW_MS = 60_000;
const REQUESTS_PER_WINDOW = 12;
// Best-effort protection only: isolate memory is not a global or durable rate limiter.
const buckets = new Map();

function json(data, status, origin, allowedOrigin) {
  const headers = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "Vary": "Origin" };
  if (origin && origin === allowedOrigin) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Methods"] = "POST, GET, OPTIONS";
    headers["Access-Control-Allow-Headers"] = "Content-Type";
    headers["Access-Control-Max-Age"] = "86400";
  }
  return new Response(JSON.stringify(data), { status, headers });
}

function allowedOrigins(env) {
  return String(env.APP_ORIGINS || "").split(",").map((x) => x.trim()).filter(Boolean);
}

function consumeRateLimit(request) {
  const now = Date.now();
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const entry = buckets.get(ip);
  if (!entry || now - entry.start >= WINDOW_MS) {
    buckets.set(ip, { start: now, count: 1 });
    if (buckets.size > 5000) {
      for (const [key, value] of buckets) if (now - value.start >= WINDOW_MS) buckets.delete(key);
    }
    return true;
  }
  if (entry.count >= REQUESTS_PER_WINDOW) return false;
  entry.count += 1;
  return true;
}

async function readJsonLimited(request, maxBytes) {
  if (!request.body) return null;
  const reader = request.body.getReader();
  const chunks = []; let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) { await reader.cancel(); throw new Error("too_large"); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder().decode(bytes));
}

function validatePayload(body) {
  if (!body || !Array.isArray(body.contents) || body.contents.length < 1 || body.contents.length > 10) return "Некорректный запрос.";
  let textChars = 0;
  let audioChars = 0;
  for (const message of body.contents) {
    if (!message || !["user", "model"].includes(message.role) || !Array.isArray(message.parts) || message.parts.length > 4) return "Некорректный формат сообщения.";
    for (const part of message.parts) {
      if (typeof part.text === "string") textChars += part.text.length;
      else if (part.inlineData && typeof part.inlineData.data === "string") {
        const mime = String(part.inlineData.mimeType || "").toLowerCase();
        if (!mime.startsWith("audio/") || part.inlineData.data.length > MAX_AUDIO_BASE64_CHARS) return "Аудиофайл превышает лимит 4 МБ или имеет неподдерживаемый формат.";
        audioChars += part.inlineData.data.length;
      } else return "Некорректная часть сообщения.";
    }
  }
  if (textChars > MAX_TEXT_CHARS || audioChars > MAX_AUDIO_BASE64_CHARS) return "Запрос превышает допустимый размер.";
  if (body.system_instruction && JSON.stringify(body.system_instruction).length > 12000) return "Некорректная инструкция.";
  return null;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin");
    const origins = allowedOrigins(env);
    const originAllowed = origin && origins.includes(origin);
    const allowedOrigin = originAllowed ? origin : "";

    if (request.method === "OPTIONS") {
      if (!originAllowed) return new Response(null, { status: 403 });
      return new Response(null, { status: 204, headers: {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Max-Age": "86400",
        "Vary": "Origin"
      }});
    }
    if (url.pathname === "/api/health" && request.method === "GET") {
      if (origin && !originAllowed) return json({ error: "Запрос с этого сайта не разрешён." }, 403, origin, "");
      return json({ ok: true, model: MODEL }, 200, origin, allowedOrigin);
    }
    if (url.pathname !== "/api/ai") return json({ error: "Маршрут не найден." }, 404, origin, allowedOrigin);
    if (request.method !== "POST") return json({ error: "Метод не поддерживается." }, 405, origin, allowedOrigin);
    if (!originAllowed) return json({ error: "Этот источник не разрешён. Проверьте APP_ORIGINS." }, 403, origin, "");
    if (!env.GEMINI_API_KEY) return json({ error: "Сервер не настроен: добавьте GEMINI_API_KEY как секрет." }, 503, origin, allowedOrigin);
    if (!consumeRateLimit(request)) return json({ error: "Слишком много запросов. Подождите минуту и попробуйте снова." }, 429, origin, allowedOrigin);

    const length = Number(request.headers.get("Content-Length") || 0);
    if (length > 6 * 1024 * 1024) return json({ error: "Запрос слишком большой. Максимальный размер аудио — 4 МБ." }, 413, origin, allowedOrigin);
    let input;
    try { input = await readJsonLimited(request, 6 * 1024 * 1024); }
    catch (error) { return json({ error: error.message === "too_large" ? "Запрос слишком большой. Максимальный размер аудио — 4 МБ." : "Не удалось прочитать запрос." }, error.message === "too_large" ? 413 : 400, origin, allowedOrigin); }
    const invalid = validatePayload(input);
    if (invalid) return json({ error: invalid }, 400, origin, allowedOrigin);

    const payload = {
      contents: input.contents,
      generationConfig: {
        ...(input.generationConfig && input.generationConfig.response_mime_type === "application/json" ? { response_mime_type: "application/json" } : {}),
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        temperature: 0.25
      }
    };
    if (input.system_instruction) payload.system_instruction = input.system_instruction;

    let upstream;
    try {
      upstream = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
        body: JSON.stringify(payload)
      });
    } catch {
      return json({ error: "Не удалось связаться с моделью ИИ. Попробуйте позже." }, 502, origin, allowedOrigin);
    }
    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      const message = upstream.status === 429
        ? "Бесплатный лимит модели временно исчерпан. Попробуйте позже."
        : upstream.status === 400
          ? "Модель не приняла запрос. Проверьте текст и формат аудио."
          : upstream.status === 401 || upstream.status === 403
            ? "Серверный Gemini API-ключ недействителен или не имеет доступа."
            : "Модель временно не ответила. Попробуйте позже.";
      return json({ error: message }, upstream.status === 429 ? 429 : 502, origin, allowedOrigin);
    }
    const text = data?.candidates?.[0]?.content?.parts?.map((part) => part?.text || "").join("").trim();
    if (!text) return json({ error: "Модель вернула пустой ответ. Попробуйте ещё раз." }, 502, origin, allowedOrigin);
    return json({ text }, 200, origin, allowedOrigin);
  }
};
