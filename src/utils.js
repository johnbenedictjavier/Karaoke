export function cleanAccountName(value) {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ");
}

export function normalizeAccountName(value) {
  return cleanAccountName(value).toLocaleLowerCase("en-US");
}

export async function accountNameToEmail(value) {
  const normalized = normalizeAccountName(value);
  const bytes = new TextEncoder().encode(normalized);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  const hex = Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `u-${hex}@users.karaokehub.invalid`;
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
    karaoke_number: input.karaokeNumber.trim(),
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
