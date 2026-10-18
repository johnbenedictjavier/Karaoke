import assert from "node:assert/strict";
import test from "node:test";
import {
  PLACEHOLDER_KARAOKE_NUMBER,
  cleanEntry,
  filterEntries,
  normalizeAccountName,
  normalizeSecurityAnswer,
  suggestionToEntryInput,
  validateEntry,
  validatePassword,
  validateSecurityAnswer,
} from "../src/utils.js";

const entries = [
  { song_title: "Dancing Queen", singer: "ABBA" },
  { song_title: "Hello", singer: "Adele" },
  { song_title: "Yellow", singer: "Coldplay" },
];

test("account names are case-insensitive and whitespace-normalized", () => {
  assert.equal(normalizeAccountName("  Maria   Santos "), "maria santos");
  assert.equal(normalizeAccountName("MARIA SANTOS"), "maria santos");
});

test("password validation uses bcrypt's byte limit", () => {
  assert.equal(validatePassword("short"), "Use a password with at least 6 characters.");
  assert.equal(validatePassword("secure password"), "");
  assert.equal(validatePassword("a".repeat(73)), "Use a password shorter than 72 bytes.");
  assert.equal(validatePassword("\u00e9".repeat(37)), "Use a password shorter than 72 bytes.");
});

test("song search only checks song titles", () => {
  assert.deepEqual(filterEntries(entries, "song_title", "hello"), [entries[1]]);
  assert.deepEqual(filterEntries(entries, "song_title", "adele"), []);
});

test("singer search only checks singers", () => {
  assert.deepEqual(filterEntries(entries, "singer", "adele"), [entries[1]]);
  assert.deepEqual(filterEntries(entries, "singer", "hello"), []);
});

test("entry values are cleaned and validated", () => {
  const entry = cleanEntry({ karaokeNumber: " 0012 ", song: "  Dancing   Queen ", singer: " ABBA " });
  assert.deepEqual(entry, { karaoke_number: "0012", song_title: "Dancing Queen", singer: "ABBA" });
  assert.equal(validateEntry(entry), "");
  assert.equal(validateEntry({ ...entry, singer: "" }), "Enter the singer or artist.");
});

test("security answers normalize like the database", () => {
  assert.equal(normalizeSecurityAnswer("  My  Favorite  Song "), "my favorite song");
  assert.equal(normalizeSecurityAnswer("BLUE"), "blue");
  assert.equal(normalizeSecurityAnswer(null), "");
});

test("security answer validation requires at least two characters", () => {
  assert.equal(validateSecurityAnswer(" a "), "Enter an answer with at least 2 characters.");
  assert.equal(validateSecurityAnswer("blue"), "");
  assert.equal(validateSecurityAnswer("\u00e9".repeat(37)), "Use a shorter answer.");
});

test("AI suggestions map to the raw entry-input shape with a placeholder number", () => {
  const input = suggestionToEntryInput({ song_title: "  Hello ", artist: " Adele ", reason: "ballad" });
  assert.deepEqual(input, {
    karaokeNumber: PLACEHOLDER_KARAOKE_NUMBER,
    song: "  Hello ",
    singer: " Adele ",
  });
  // cleanEntry then normalizes it into what create_karaoke_entry receives.
  assert.deepEqual(cleanEntry(input), {
    karaoke_number: PLACEHOLDER_KARAOKE_NUMBER,
    song_title: "Hello",
    singer: "Adele",
  });
});
