import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_SUGGESTIONS,
  normalizeSuggestion,
  normalizeSuggestionList,
  parseGeminiSuggestions,
} from "../supabase/functions/discover-songs/suggestions.js";

test("a valid item keeps song, artist, and reason", () => {
  assert.deepEqual(
    normalizeSuggestion({ song_title: "  Hello ", artist: " Adele ", reason: "  90s   ballad " }),
    { song_title: "Hello", artist: "Adele", reason: "90s ballad" },
  );
});

test("items missing song or artist are dropped", () => {
  assert.equal(normalizeSuggestion({ song_title: "Hello" }), null);
  assert.equal(normalizeSuggestion({ artist: "Adele" }), null);
  assert.equal(normalizeSuggestion(null), null);
  assert.equal(normalizeSuggestion("Hello"), null);
});

test("alternate field names are accepted", () => {
  assert.deepEqual(
    normalizeSuggestion({ song: "Yellow", singer: "Coldplay", why: "mellow" }),
    { song_title: "Yellow", artist: "Coldplay", reason: "mellow" },
  );
});

test("a missing reason becomes an empty string, not a drop", () => {
  assert.deepEqual(
    normalizeSuggestion({ song_title: "Yellow", artist: "Coldplay" }),
    { song_title: "Yellow", artist: "Coldplay", reason: "" },
  );
});

test("the list normalizer handles non-arrays safely", () => {
  assert.deepEqual(normalizeSuggestionList(null), []);
  assert.deepEqual(normalizeSuggestionList("nope"), []);
  assert.deepEqual(normalizeSuggestionList(42), []);
});

test("the list normalizer unwraps common array-wrapping keys", () => {
  const wrapped = { suggestions: [{ song_title: "Hello", artist: "Adele" }] };
  assert.deepEqual(normalizeSuggestionList(wrapped), [
    { song_title: "Hello", artist: "Adele", reason: "" },
  ]);
});

test("the list normalizer drops invalid items and de-duplicates", () => {
  const list = normalizeSuggestionList([
    { song_title: "Hello", artist: "Adele", reason: "a" },
    { song_title: "hello", artist: "ADELE", reason: "dup" },
    { song_title: "Broken" },
    { song_title: "Yellow", artist: "Coldplay", reason: "b" },
  ]);
  assert.deepEqual(list, [
    { song_title: "Hello", artist: "Adele", reason: "a" },
    { song_title: "Yellow", artist: "Coldplay", reason: "b" },
  ]);
});

test("the list normalizer caps the result length", () => {
  const many = Array.from({ length: 25 }, (_, i) => ({
    song_title: `Song ${i}`,
    artist: `Artist ${i}`,
  }));
  assert.equal(normalizeSuggestionList(many).length, MAX_SUGGESTIONS);
});

test("Gemini responses with a plain JSON array are parsed", () => {
  const response = {
    candidates: [
      {
        content: {
          parts: [
            { text: '[{"song_title":"Hello","artist":"Adele","reason":"ballad"}]' },
          ],
        },
      },
    ],
  };
  assert.deepEqual(parseGeminiSuggestions(response), [
    { song_title: "Hello", artist: "Adele", reason: "ballad" },
  ]);
});

test("Gemini responses wrapped in a markdown fence are parsed", () => {
  const response = {
    candidates: [
      {
        content: {
          parts: [
            { text: '```json\n[{"song_title":"Yellow","artist":"Coldplay"}]\n```' },
          ],
        },
      },
    ],
  };
  assert.deepEqual(parseGeminiSuggestions(response), [
    { song_title: "Yellow", artist: "Coldplay", reason: "" },
  ]);
});

test("malformed or empty Gemini responses yield an empty list", () => {
  assert.deepEqual(parseGeminiSuggestions(null), []);
  assert.deepEqual(parseGeminiSuggestions({}), []);
  assert.deepEqual(
    parseGeminiSuggestions({ candidates: [{ content: { parts: [{ text: "sorry, no idea" }] } }] }),
    [],
  );
});
