// discover-songs: AI song recommendations for HimiGora.
//
// Takes a free-text vibe/theme prompt (e.g. "90s Filipino love songs") and asks
// Gemini for matching songs. Returns a normalized list of { song_title, artist,
// reason }. It never returns karaoke numbers (no reliable source exists); the
// user fills those in from their own machine.
//
// Secrets: set GEMINI_API_KEY as a Supabase secret. It never reaches the
// browser; the static frontend only calls this function.

// @ts-ignore - resolved by the Deno runtime at deploy time.
import { parseGeminiSuggestions, MAX_SUGGESTIONS } from "./suggestions.js";

const GEMINI_MODEL = "gemini-2.0-flash";
const GEMINI_ENDPOINT =
  `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

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

function buildGeminiRequest(prompt: string) {
  const instruction = [
    "You are a karaoke song recommender.",
    `Given a theme, mood, or vibe, suggest up to ${MAX_SUGGESTIONS} well-known, singable karaoke songs that fit it.`,
    "Return ONLY a JSON array. Each element must be an object with exactly these string fields:",
    '"song_title" (the song name), "artist" (the original performer), and',
    '"reason" (a short phrase, max ~12 words, explaining why it fits the request).',
    "Do not include karaoke numbers, track IDs, commentary, or markdown. Output JSON only.",
    `Request: ${prompt}`,
  ].join(" ");

  return {
    contents: [{ role: "user", parts: [{ text: instruction }] }],
    generationConfig: {
      temperature: 0.9,
      responseMimeType: "application/json",
    },
  };
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

  let geminiResponse: Response;
  try {
    geminiResponse = await fetch(`${GEMINI_ENDPOINT}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildGeminiRequest(prompt)),
    });
  } catch {
    return jsonResponse({ error: "ai_unavailable" }, 502);
  }

  if (!geminiResponse.ok) {
    return jsonResponse({ error: "ai_unavailable" }, 502);
  }

  let data: unknown;
  try {
    data = await geminiResponse.json();
  } catch {
    return jsonResponse({ error: "ai_unavailable" }, 502);
  }

  const suggestions = parseGeminiSuggestions(data);
  return jsonResponse({ suggestions });
});
