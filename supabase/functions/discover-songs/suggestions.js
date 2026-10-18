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
    // Fall back to the first complete JSON array found anywhere in the text.
    const arrayMatch = candidate.match(/\[[\s\S]*\]/);
    if (arrayMatch) {
      try {
        return JSON.parse(arrayMatch[0]);
      } catch {
        // Fall through to truncation recovery.
      }
    }
    return salvageTruncatedArray(candidate);
  }
}

// Recover the complete objects from a JSON array that was cut off mid-stream
// (for example when the model hits its output-token limit). Collects every
// top-level `{ ... }` object and parses them individually, dropping any final
// partial one.
function salvageTruncatedArray(text) {
  const start = text.indexOf("[");
  if (start === -1) return null;

  const objects = [];
  let depth = 0;
  let objectStart = -1;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i += 1) {
    const char = text[i];

    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }

    if (char === '"') {
      inString = true;
    } else if (char === "{") {
      if (depth === 0) objectStart = i;
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0 && objectStart !== -1) {
        try {
          objects.push(JSON.parse(text.slice(objectStart, i + 1)));
        } catch {
          // Skip an object we cannot parse.
        }
        objectStart = -1;
      }
    }
  }

  return objects.length ? objects : null;
}
