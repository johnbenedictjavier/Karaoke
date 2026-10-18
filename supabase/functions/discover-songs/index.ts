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

// Tried in order; the first model the key can reach wins. Newer/better models
// first, with widely-available fallbacks so a key with limited model access
// still works.
const GEMINI_MODELS = [
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-1.5-flash",
];

const API_ROOT = "https://generativelanguage.googleapis.com/v1beta/models";
const MAX_PROMPT_LENGTH = 300;

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
      maxOutputTokens: 1024,
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA,
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

  let lastHardFailure = false;
  for (const model of GEMINI_MODELS) {
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
