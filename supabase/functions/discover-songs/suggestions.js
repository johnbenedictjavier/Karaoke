// Pure helpers for the discover-songs edge function.
//
// Kept dependency-free and framework-agnostic so the same logic runs in the
// Deno edge runtime and in Node's test runner. No imports, no Deno/Node APIs.

export const MAX_SUGGESTIONS = 10;

const MAX_FIELD_LENGTHS = {
  song_title: 120,
  artist: 100,
  reason: 140,
};

function cleanField(value, maxLength) {
  if (typeof value !== "string") return "";
  const collapsed = value.normalize("NFKC").replace(/\s+/g, " ").trim();
  return collapsed.slice(0, maxLength);
}

// Turn one raw AI item into a clean suggestion, or null when it lacks the
// essential song + artist pair.
export function normalizeSuggestion(raw) {
  if (!raw || typeof raw !== "object") return null;

  const song_title = cleanField(raw.song_title ?? raw.song ?? raw.title, MAX_FIELD_LENGTHS.song_title);
  const artist = cleanField(raw.artist ?? raw.singer ?? raw.artists, MAX_FIELD_LENGTHS.artist);
  const reason = cleanField(raw.reason ?? raw.why ?? raw.note ?? raw.tag, MAX_FIELD_LENGTHS.reason);

  if (!song_title || !artist) return null;

  return { song_title, artist, reason };
}

// Normalize an arbitrary AI payload into a capped, de-duplicated suggestion
// list. Accepts either an array or an object wrapping an array under common
// keys. Anything unparseable yields an empty list rather than throwing.
export function normalizeSuggestionList(payload) {
  let items = payload;

  if (items && !Array.isArray(items) && typeof items === "object") {
    items = items.suggestions ?? items.songs ?? items.results ?? items.items ?? items.data;
  }

  if (!Array.isArray(items)) return [];

  const seen = new Set();
  const suggestions = [];

  for (const raw of items) {
    const suggestion = normalizeSuggestion(raw);
    if (!suggestion) continue;

    const key = `${suggestion.song_title.toLowerCase()}|${suggestion.artist.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);

    suggestions.push(suggestion);
    if (suggestions.length >= MAX_SUGGESTIONS) break;
  }

  return suggestions;
}

// Extract the model's text payload from a Gemini generateContent response and
// parse the JSON array it was asked to return. Tolerates markdown code fences
// and surrounding prose; returns [] when nothing parseable is present.
export function parseGeminiSuggestions(geminiResponse) {
  const parts = geminiResponse?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return [];

  const text = parts
    .map((part) => (typeof part?.text === "string" ? part.text : ""))
    .join("")
    .trim();

  if (!text) return [];

  const parsed = extractJson(text);
  return normalizeSuggestionList(parsed);
}

function extractJson(text) {
  // Strip a ```json ... ``` or ``` ... ``` fence if present.
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : text;

  try {
    return JSON.parse(candidate);
  } catch {
    // Fall back to the first JSON array found anywhere in the text.
    const arrayMatch = candidate.match(/\[[\s\S]*\]/);
    if (arrayMatch) {
      try {
        return JSON.parse(arrayMatch[0]);
      } catch {
        return null;
      }
    }
    return null;
  }
}
