export function cleanAccountName(value) {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ");
}

export function normalizeAccountName(value) {
  return cleanAccountName(value).toLocaleLowerCase("en-US");
}

export function validatePassword(password) {
  if (password.length < 6) return "Use a password with at least 6 characters.";
  if (new TextEncoder().encode(password).length > 72) return "Use a password shorter than 72 bytes.";
  return "";
}

// The single fixed security question shown everywhere (signup, profile, reset).
export const SECURITY_QUESTION = "What is your favorite song?";

// Mirrors private.normalize_security_answer in supabase/schema.sql so the client
// validates against the same normalized form the database compares.
export function normalizeSecurityAnswer(value) {
  return (value ?? "")
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("en-US");
}

export function validateSecurityAnswer(answer) {
  const normalized = normalizeSecurityAnswer(answer);
  if (normalized.length < 2) return "Enter an answer with at least 2 characters.";
  if (new TextEncoder().encode(normalized).length > 72) return "Use a shorter answer.";
  return "";
}

// Placeholder karaoke number for AI-added songs. The AI never returns a
// reliable number, and the database requires a non-empty number, so we store a
// visible placeholder the user replaces with the number from their own machine.
export const PLACEHOLDER_KARAOKE_NUMBER = "—";

// Map an AI suggestion to the cleaned fields create_karaoke_entry expects. The
// karaoke number is a placeholder the user edits later.
export function suggestionToEntryInput(suggestion) {
  return cleanEntry({
    karaokeNumber: PLACEHOLDER_KARAOKE_NUMBER,
    song: suggestion?.song_title ?? "",
    singer: suggestion?.artist ?? "",
  });
}

export function filterEntries(entries, field, query) {
  const needle = query.normalize("NFKC").trim().toLocaleLowerCase();
  if (!needle) return entries;

  return entries.filter((entry) =>
    String(entry[field] ?? "")
      .normalize("NFKC")
      .toLocaleLowerCase()
      .includes(needle),
  );
}

export function cleanEntry(input) {
  return {
    karaoke_number: input.karaokeNumber.trim().replace(/\s+/g, " "),
    song_title: input.song.trim().replace(/\s+/g, " "),
    singer: input.singer.trim().replace(/\s+/g, " "),
  };
}

export function validateEntry(entry) {
  if (!entry.karaoke_number) return "Enter a karaoke number.";
  if (!entry.song_title) return "Enter the song name.";
  if (!entry.singer) return "Enter the singer or artist.";
  return "";
}
