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
