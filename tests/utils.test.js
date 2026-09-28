import assert from "node:assert/strict";
import test from "node:test";
import {
  accountNameToEmail,
  cleanEntry,
  filterEntries,
  normalizeAccountName,
  validateEntry,
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

test("equivalent account names produce the same private auth identifier", async () => {
  const first = await accountNameToEmail("Maria Santos");
  const second = await accountNameToEmail("  maria   santos  ");

  assert.equal(first, second);
  assert.match(first, /^u-[a-f0-9]{64}@users\.karaokehub\.invalid$/);
  assert.equal(first.includes("maria"), false);
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
