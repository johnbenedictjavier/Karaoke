// discover-songs: AI song recommendations for HimiGora.
//
// Takes a free-text vibe/theme prompt (e.g. "90s Filipino love songs") and asks
// Gemini for matching karaoke songs. Returns a normalized list of
// { song_title, artist, reason }. It never returns karaoke numbers (no reliable
// source exists); the user fills those in from their own machine.
//
// Secrets: set GEMINI_API_KEY as a Supabase secret. It never reaches the
// browser; the static frontend only calls this function.

// @ts-ignore - resolved by the Deno runtime at deploy time.
import { parseGeminiSuggestions, MAX_SUGGESTIONS } from "./suggestions.js";

// Preferred models, best first. The function also discovers models the key can
// actually reach via ListModels, so it works regardless of key tier. An
// optional GEMINI_MODEL secret is tried before everything else.
const PREFERRED_MODELS = [
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-flash-latest",
  "gemini-2.5-flash-lite",
  "gemini-1.5-flash",
  "gemini-1.5-flash-latest",
];

const API_ROOT = "https://generativelanguage.googleapis.com/v1beta/models";
const MAX_PROMPT_LENGTH = 300;

// Ask the API which models this key may call with generateContent, so we never
// guess a name the key can't reach. Returns [] on any failure (we then fall
// back to the preferred list).
async function listUsableModels(apiKey: string): Promise<string[]> {
  try {
    const response = await fetch(`${API_ROOT}?key=${apiKey}&pageSize=100`);
    if (!response.ok) return [];
    const data = await response.json();
    const models = Array.isArray(data?.models) ? data.models : [];
    return models
      .filter((m: Record<string, unknown>) =>
        Array.isArray(m?.supportedGenerationMethods) &&
        (m.supportedGenerationMethods as string[]).includes("generateContent")
      )
      .map((m: Record<string, unknown>) => String(m?.name ?? "").replace(/^models\//, ""))
      .filter(Boolean);
  } catch {
    return [];
  }
}

// Order the usable models by our preference, then append any extras. A static
// fallback keeps behavior sane if ListModels is unavailable.
function orderModels(usable: string[], preferredExtra?: string | null): string[] {
  const ordered: string[] = [];
  const seen = new Set<string>();
  const push = (name: string) => {
    if (name && !seen.has(name)) {
      seen.add(name);
      ordered.push(name);
    }
  };

  if (preferredExtra) push(preferredExtra);

  if (usable.length) {
    for (const name of PREFERRED_MODELS) if (usable.includes(name)) push(name);
    // Prefer any remaining "flash" model before heavier "pro" models.
    for (const name of usable) if (name.includes("flash")) push(name);
    for (const name of usable) push(name);
  } else {
    for (const name of PREFERRED_MODELS) push(name);
  }

  return ordered;
}

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const SYSTEM_INSTRUCTION = [
  "You are a knowledgeable karaoke host with deep, worldwide song knowledge,",
  "including OPM/Filipino, Western pop, rock, R&B, K-pop, J-pop, and classics across decades.",
  "You recommend real, well-known, singable karaoke songs that genuinely match the user's request.",
  "Prefer songs that commonly appear in karaoke catalogs. Vary artists and eras unless the user asks otherwise.",
  "Never invent songs or artists. If the request names a decade, country, language, or genre, respect it strictly.",
].join(" ");

// Structured-output schema so the model returns clean JSON every time.
const RESPONSE_SCHEMA = {
  type: "ARRAY",
  items: {
    type: "OBJECT",
    properties: {
      song_title: { type: "STRING" },
      artist: { type: "STRING" },
      reason: { type: "STRING" },
    },
    required: ["song_title", "artist", "reason"],
  },
};

const SAFETY_SETTINGS = [
  "HARM_CATEGORY_HARASSMENT",
  "HARM_CATEGORY_HATE_SPEECH",
  "HARM_CATEGORY_SEXUALLY_EXPLICIT",
  "HARM_CATEGORY_DANGEROUS_CONTENT",
].map((category) => ({ category, threshold: "BLOCK_ONLY_HIGH" }));

function buildGeminiRequest(prompt: string) {
  const userText = [
    `Suggest up to ${MAX_SUGGESTIONS} karaoke songs that fit this request:`,
    `"${prompt}".`,
    'For each song give "song_title" (exact song name), "artist" (original performer),',
    'and "reason" (a short phrase, max ~12 words, on why it fits).',
  ].join(" ");

  return {
    systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
    contents: [{ role: "user", parts: [{ text: userText }] }],
    safetySettings: SAFETY_SETTINGS,
    generationConfig: {
      temperature: 0.85,
      topP: 0.95,
      // Generous budget: newer "thinking" models spend output tokens on hidden
      // reasoning, so a small cap truncates the JSON answer mid-string.
      maxOutputTokens: 8192,
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA,
      // Keep thinking models from burning the whole budget on reasoning.
      // Ignored by models that don't support it.
      thinkingConfig: { thinkingBudget: 0 },
    },
  };
}

// Call one model. Returns { ok, suggestions } on success, or { ok:false, retry }
// where retry=true means "try the next model" (model/endpoint problem) and
// retry=false means a hard failure that another model would not fix.
async function callModel(model: string, apiKey: string, prompt: string) {
  let response: Response;
  try {
    response = await fetch(`${API_ROOT}/${model}:generateContent?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildGeminiRequest(prompt)),
    });
  } catch {
    return { ok: false, retry: true as const };
  }

  // 404 (unknown model) or 400 (bad model/args) -> worth trying another model.
  if (response.status === 404 || response.status === 400) {
    return { ok: false, retry: true as const };
  }
  if (!response.ok) {
    return { ok: false, retry: false as const };
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    return { ok: false, retry: false as const };
  }

  return { ok: true as const, suggestions: parseGeminiSuggestions(data) };
}

// @ts-ignore - Deno global is available in the edge runtime.
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405);
  }

  // @ts-ignore - Deno global is available in the edge runtime.
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) {
    return jsonResponse({ error: "server_not_configured" }, 500);
  }

  let prompt = "";
  try {
    const body = await req.json();
    prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
  } catch {
    return jsonResponse({ error: "invalid_request" }, 400);
  }

  if (!prompt) {
    return jsonResponse({ error: "empty_prompt" }, 400);
  }
  prompt = prompt.slice(0, MAX_PROMPT_LENGTH);

  // @ts-ignore - Deno global is available in the edge runtime.
  const preferredModel = Deno.env.get("GEMINI_MODEL");
  const usable = await listUsableModels(apiKey);
  const models = orderModels(usable, preferredModel);

  let lastHardFailure = false;
  for (const model of models) {
    const result = await callModel(model, apiKey, prompt);
    if (result.ok) {
      return jsonResponse({ suggestions: result.suggestions, model });
    }
    if (!result.retry) {
      lastHardFailure = true;
      break;
    }
  }

  return jsonResponse({ error: "ai_unavailable", hard: lastHardFailure }, 502);
});
