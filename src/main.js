import { createClient } from "@supabase/supabase-js";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "./config.js";
import {
  SECURITY_QUESTION,
  cleanAccountName,
  cleanEntry,
  filterEntries,
  suggestionToEntryInput,
  validateEntry,
  validatePassword,
  validateSecurityAnswer,
} from "./utils.js";
import "./styles.css";

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});

const SESSION_STORAGE_KEY = "karaokehub-account-session";
const LEGACY_AUTH_STORAGE_KEY = "sb-nirtjqjcqaxlrskuvpjy-auth-token";

const icons = {
  more: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="5" r="1.5"></circle><circle cx="12" cy="12" r="1.5"></circle><circle cx="12" cy="19" r="1.5"></circle></svg>',
  edit: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 16-.8 4.8L8 20l11-11-4-4L4 16Z"></path><path d="m13.5 6.5 4 4"></path></svg>',
  trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"></path></svg>',
  mic: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5a4 4 0 0 1 8 0v6a4 4 0 0 1-8 0V5Z"></path><path d="M5 10v1a7 7 0 0 0 14 0v-1M12 18v3M8 21h8"></path></svg>',
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"></path></svg>',
  close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17"></path></svg>',
  plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"></path></svg>',
};

const TAB_TITLES = {
  songs: "Songs",
  discover: "Discover",
  add: "Add a song",
  profile: "Profile",
};

const $ = (selector) => document.querySelector(selector);

const elements = {
  bootScreen: $("#boot-screen"),
  authView: $("#auth-view"),
  appView: $("#app-view"),
  // Auth
  authCard: $("#auth-card"),
  resetCard: $("#reset-card"),
  authForm: $("#auth-form"),
  authName: $("#auth-name"),
  authPassword: $("#auth-password"),
  authAnswer: $("#auth-answer"),
  signupAnswerGroup: $("#signup-answer-group"),
  signupQuestionText: $("#signup-question-text"),
  authError: $("#auth-error"),
  authSubmit: $("#auth-submit"),
  authSubmitLabel: $("#auth-submit-label"),
  authEyebrow: $("#auth-eyebrow"),
  authTitle: $("#auth-title"),
  authDescription: $("#auth-description"),
  authFootnote: $("#auth-footnote"),
  authSwitch: $("#auth-switch"),
  loginTab: $("#login-tab"),
  signupTab: $("#signup-tab"),
  passwordToggle: $("#password-toggle"),
  forgotLink: $("#forgot-link"),
  // Reset
  resetForm: $("#reset-form"),
  resetName: $("#reset-name"),
  resetAnswer: $("#reset-answer"),
  resetPassword: $("#reset-password"),
  resetQuestionText: $("#reset-question-text"),
  resetError: $("#reset-error"),
  resetSubmit: $("#reset-submit"),
  resetBack: $("#reset-back"),
  // Shell
  tabTitle: $("#tab-title"),
  navItems: document.querySelectorAll(".nav-item"),
  tabPanels: {
    songs: $("#tab-songs"),
    discover: $("#tab-discover"),
    add: $("#tab-add"),
    profile: $("#tab-profile"),
  },
  // Banner
  answerBanner: $("#answer-banner"),
  answerBannerGo: $("#answer-banner-go"),
  answerBannerDismiss: $("#answer-banner-dismiss"),
  // Songs
  statSongCount: $("#stat-song-count"),
  statSingCount: $("#stat-sing-count"),
  statFavoriteSong: $("#stat-favorite-song"),
  statFavoriteCount: $("#stat-favorite-count"),
  navSongCount: $("#nav-song-count"),
  libraryFilterButtons: document.querySelectorAll("[data-library-filter]"),
  searchInput: $("#search-input"),
  searchFieldSelect: $("#search-field-select"),
  clearSearch: $("#clear-search"),
  resultsLabel: $("#results-label"),
  listLoading: $("#list-loading"),
  entryList: $("#entry-list"),
  emptyState: $("#empty-state"),
  emptyTitle: $("#empty-title"),
  emptyDescription: $("#empty-description"),
  emptyAddButton: $("#empty-add-button"),
  // Discover
  discoverForm: $("#discover-form"),
  discoverInput: $("#discover-input"),
  discoverSubmit: $("#discover-submit"),
  discoverChips: $("#discover-chips"),
  discoverLoading: $("#discover-loading"),
  discoverEmpty: $("#discover-empty"),
  discoverEmptyText: $("#discover-empty-text"),
  discoverResults: $("#discover-results"),
  // Add
  addForm: $("#add-form"),
  addNumber: $("#add-number"),
  addSong: $("#add-song"),
  addSinger: $("#add-singer"),
  addError: $("#add-error"),
  addSubmit: $("#add-submit"),
  // Profile
  profileInitial: $("#profile-initial"),
  profileName: $("#profile-name"),
  profileRecovery: $("#profile-recovery"),
  profileQuestionText: $("#profile-question-text"),
  answerForm: $("#answer-form"),
  answerInput: $("#answer-input"),
  answerError: $("#answer-error"),
  answerSubmit: $("#answer-submit"),
  answerSubmitLabel: $("#answer-submit-label"),
  logoutButton: $("#logout-button"),
  // Dialogs
  entryDialog: $("#entry-dialog"),
  entryForm: $("#entry-form"),
  entryDialogEyebrow: $("#entry-dialog-eyebrow"),
  entryDialogTitle: $("#entry-dialog-title"),
  entryDialogDescription: $("#entry-dialog-description"),
  entryNumber: $("#entry-number"),
  entrySong: $("#entry-song"),
  entrySinger: $("#entry-singer"),
  entryError: $("#entry-error"),
  entrySubmit: $("#entry-submit"),
  entrySubmitLabel: $("#entry-submit-label"),
  confirmDialog: $("#confirm-dialog"),
  confirmSong: $("#confirm-song"),
  confirmError: $("#confirm-error"),
  confirmDelete: $("#confirm-delete"),
  toastRegion: $("#toast-region"),
};

const state = {
  authMode: "login",
  authScreen: "signin", // signin | reset
  user: null,
  authResolved: false,
  sessionToken: null,
  entries: [],
  searchField: "song_title",
  searchQuery: "",
  libraryFilter: "all",
  activeTab: "songs",
  editingId: null,
  deletingId: null,
  answerBannerDismissed: false,
};

/* ------------------------------------------------------------------ theme */

function getSavedTheme() {
  try {
    return localStorage.getItem("karaokehub-theme");
  } catch {
    return null;
  }
}

function applyTheme(theme, persist = false) {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]').content = theme === "dark" ? "#111116" : "#f4f0e8";

  if (persist) {
    try {
      localStorage.setItem("karaokehub-theme", theme);
    } catch {
      // A blocked localStorage should not prevent theme switching.
    }
  }

  document.querySelectorAll("[data-theme-toggle]").forEach((button) => {
    const nextTheme = theme === "dark" ? "light" : "dark";
    button.setAttribute("aria-label", `Switch to ${nextTheme} mode`);
    button.title = `Switch to ${nextTheme} mode`;
  });
}

function initializeTheme() {
  const savedTheme = getSavedTheme();
  const systemTheme = matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  applyTheme(savedTheme || systemTheme);

  document.querySelectorAll("[data-theme-toggle]").forEach((button) => {
    button.addEventListener("click", () => {
      const nextTheme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
      applyTheme(nextTheme, true);
    });
  });

  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (event) => {
    if (!getSavedTheme()) applyTheme(event.matches ? "dark" : "light");
  });
}

/* ---------------------------------------------------------------- session */

function getStoredSessionToken() {
  try {
    return localStorage.getItem(SESSION_STORAGE_KEY);
  } catch {
    return null;
  }
}

function storeSessionToken(token) {
  state.sessionToken = token;
  try {
    localStorage.setItem(SESSION_STORAGE_KEY, token);
  } catch {
    // The active tab can still use the session when storage is blocked.
  }
}

function clearSessionToken() {
  state.sessionToken = null;
  try {
    localStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    // The in-memory session is still cleared.
  }
}

function clearLegacyAuthSession() {
  try {
    localStorage.removeItem(LEGACY_AUTH_STORAGE_KEY);
  } catch {
    // Legacy Auth storage is ignored when localStorage is unavailable.
  }
}

/* ------------------------------------------------------------------ utils */

function setMessage(element, message = "") {
  element.textContent = message;
  element.hidden = !message;
}

function setButtonLoading(button, isLoading) {
  button.classList.toggle("is-loading", isLoading);
  button.disabled = isLoading;
  button.setAttribute("aria-busy", String(isLoading));
}

function showToast(message, type = "success") {
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<span class="toast-icon">${type === "success" ? icons.check : icons.close}</span><span class="toast-message"></span><button type="button" aria-label="Dismiss notification">${icons.close}</button>`;
  toast.querySelector(".toast-message").textContent = message;
  elements.toastRegion.append(toast);

  const remove = () => {
    toast.classList.remove("is-visible");
    window.setTimeout(() => toast.remove(), 220);
  };

  toast.querySelector("button").addEventListener("click", remove);
  requestAnimationFrame(() => toast.classList.add("is-visible"));
  window.setTimeout(remove, 4200);
}

function friendlyAuthError(error) {
  const message = error?.message?.toLowerCase() || "";
  if (message.includes("invalid_name_or_password")) return "That name or password is not correct.";
  if (message.includes("invalid_name_or_answer")) return "That name or answer is not correct.";
  if (message.includes("account_name_taken")) return "That account name is already in use. Try signing in instead.";
  if (message.includes("invalid_account_name")) return "Use an account name between 1 and 40 characters.";
  if (message.includes("invalid_password_length")) return "Use a password between 6 and 72 bytes.";
  if (message.includes("invalid_security_answer")) return "Use a security answer with at least 2 characters.";
  if (["42501", "PGRST202", "PGRST204", "PGRST205"].includes(error?.code)) {
    return "Custom account setup is not complete. Run supabase/schema.sql in the Supabase SQL Editor.";
  }
  if (message.includes("fetch") || message.includes("network")) return "Unable to connect. Check your internet connection and try again.";
  return "Something went wrong. Please try again.";
}

function friendlyDataError(error) {
  const message = error?.message?.toLowerCase() || "";
  if (["42501", "42P01", "PGRST202", "PGRST204", "PGRST205"].includes(error?.code)) {
    return "Database setup is not complete. Run supabase/schema.sql in the Supabase SQL Editor.";
  }
  if (message.includes("invalid_or_expired_session")) return "Your session has expired. Sign in again.";
  if (error?.code === "23514") return "One of the values is too long or invalid.";
  if (message.includes("invalid_karaoke_entry")) return "Complete all karaoke fields and check their lengths.";
  if (message.includes("fetch")) return "Unable to connect. Check your internet connection.";
  return "Could not save that change. Please try again.";
}

function isSessionError(error) {
  return error?.message?.toLowerCase().includes("invalid_or_expired_session");
}

function normalizeEntryResponse(entry) {
  if (!entry) return entry;
  return { ...entry, sing_count: Number(entry.sing_count || 0) };
}

function formatNumber(value) {
  return new Intl.NumberFormat().format(Number(value || 0));
}

function formatLastSung(value) {
  if (!value) return "Not sung yet";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not sung yet";

  const today = new Date();
  const dateKey = date.toLocaleDateString();
  if (dateKey === today.toLocaleDateString()) return "Sung today";

  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (dateKey === yesterday.toLocaleDateString()) return "Sung yesterday";

  return `Last sung ${new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(date)}`;
}

/* --------------------------------------------------------------- entries */

function sortEntriesForLibrary(entries) {
  if (state.libraryFilter === "most-sung") {
    return [...entries].sort((a, b) => {
      const countDifference = Number(b.sing_count || 0) - Number(a.sing_count || 0);
      if (countDifference) return countDifference;
      return new Date(b.last_sung_at || b.created_at) - new Date(a.last_sung_at || a.created_at);
    });
  }
  if (state.libraryFilter === "recent") {
    return [...entries].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }
  return entries;
}

function updatePlaylistStats() {
  const totalSings = state.entries.reduce((total, entry) => total + Number(entry.sing_count || 0), 0);
  const topEntry = [...state.entries].sort((a, b) => Number(b.sing_count || 0) - Number(a.sing_count || 0))[0];

  elements.statSongCount.textContent = formatNumber(state.entries.length);
  elements.statSingCount.textContent = formatNumber(totalSings);
  elements.navSongCount.textContent = formatNumber(state.entries.length);

  if (topEntry && Number(topEntry.sing_count || 0) > 0) {
    elements.statFavoriteSong.textContent = topEntry.song_title;
    elements.statFavoriteCount.textContent = `${formatNumber(topEntry.sing_count)} ${Number(topEntry.sing_count) === 1 ? "sing" : "sings"}`;
  } else {
    elements.statFavoriteSong.textContent = "No repeats yet";
    elements.statFavoriteCount.textContent = "Log your first sing";
  }
}

function updateLibraryFilter(filter) {
  state.libraryFilter = filter;
  elements.libraryFilterButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.libraryFilter === filter);
  });
  renderEntries();
}

function renderEntries() {
  const libraryEntries = sortEntriesForLibrary(state.entries);
  const filteredEntries = filterEntries(libraryEntries, state.searchField, state.searchQuery);
  const hasQuery = Boolean(state.searchQuery.trim());
  const count = state.entries.length;

  elements.listLoading.hidden = true;
  elements.entryList.replaceChildren();
  updatePlaylistStats();
  elements.resultsLabel.textContent = hasQuery
    ? `${formatNumber(filteredEntries.length)} of ${formatNumber(count)} ${count === 1 ? "song" : "songs"}`
    : `${formatNumber(filteredEntries.length)} ${filteredEntries.length === 1 ? "song" : "songs"}`;

  if (!filteredEntries.length) {
    elements.entryList.hidden = true;
    elements.emptyState.hidden = false;
    const hasLibraryContent = count > 0;
    elements.emptyAddButton.hidden = hasQuery || hasLibraryContent;
    elements.emptyTitle.textContent = hasQuery
      ? "No matches found"
      : hasLibraryContent
        ? "Nothing in this view yet"
        : "No Karaoke Numbers Yet";
    elements.emptyDescription.textContent = hasQuery
      ? `No ${state.searchField === "song_title" ? "song" : "singer"} matches "${state.searchQuery.trim()}". Try another search.`
      : hasLibraryContent
        ? "Log a sing to make this list your own, or switch to another view."
        : "Add your first song and start building a setlist that is always ready.";
    return;
  }

  elements.emptyState.hidden = true;
  elements.entryList.hidden = false;
  filteredEntries.forEach((entry, index) => elements.entryList.append(createEntryRow(entry, index)));
}

function renderLoadError(message) {
  elements.entryList.hidden = true;
  elements.emptyState.hidden = false;
  elements.emptyTitle.textContent = "Songbook unavailable";
  elements.emptyDescription.textContent = message;
  elements.emptyAddButton.hidden = true;
  elements.resultsLabel.textContent = "Could not load songbook";
  updatePlaylistStats();
}

function createEntryRow(entry, index) {
  const row = document.createElement("li");
  row.className = "entry-row";
  row.style.setProperty("--row-index", Math.min(index, 8));
  row.innerHTML = `
    <div class="entry-number"><small>No.</small><span></span></div>
    <div class="entry-copy"><strong></strong><span></span></div>
    <div class="entry-sings">
      <button class="sing-button" type="button" data-action="sing"><span class="sing-icon">${icons.mic}</span><span class="sing-count"></span></button>
      <small></small>
    </div>
    <div class="entry-actions">
      <button class="row-menu-button" type="button" aria-haspopup="menu" aria-expanded="false">${icons.more}</button>
      <div class="row-menu" role="menu" aria-hidden="true">
        <button type="button" role="menuitem" data-action="edit">${icons.edit}<span>Edit</span></button>
        <button class="delete-menu-item" type="button" role="menuitem" data-action="delete">${icons.trash}<span>Delete</span></button>
      </div>
    </div>`;

  row.querySelector(".entry-number span").textContent = entry.karaoke_number;
  row.querySelector(".entry-copy strong").textContent = entry.song_title;
  row.querySelector(".entry-copy span").textContent = entry.singer;
  row.querySelector(".entry-sings .sing-count").textContent = formatNumber(entry.sing_count);
  row.querySelector(".entry-sings > small").textContent = formatLastSung(entry.last_sung_at);

  const menuButton = row.querySelector(".row-menu-button");
  const menu = row.querySelector(".row-menu");
  menuButton.setAttribute("aria-label", `Actions for ${entry.song_title}`);

  const singButton = row.querySelector(".sing-button");
  singButton.setAttribute("aria-label", `Log a sing of ${entry.song_title}`);
  singButton.addEventListener("click", (event) => {
    event.stopPropagation();
    recordSing(entry, singButton);
  });

  menuButton.addEventListener("click", (event) => {
    event.stopPropagation();
    const isOpen = row.classList.contains("menu-open");
    closeActionMenus();
    if (!isOpen) {
      row.classList.add("menu-open");
      menuButton.setAttribute("aria-expanded", "true");
      menu.setAttribute("aria-hidden", "false");
      menu.querySelector("button").focus();
    }
  });

  menu.addEventListener("click", (event) => {
    event.stopPropagation();
    const actionButton = event.target.closest("[data-action]");
    if (!actionButton) return;
    closeActionMenus();
    if (actionButton.dataset.action === "edit") openEntryDialog(entry);
    if (actionButton.dataset.action === "delete") openDeleteDialog(entry);
  });

  menu.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    closeActionMenus();
    menuButton.focus();
  });

  return row;
}

async function recordSing(entry, button) {
  if (button.disabled) return;
  button.disabled = true;
  button.classList.add("is-loading");
  button.setAttribute("aria-busy", "true");

  try {
    const { data, error } = await supabase.rpc("record_karaoke_sing", {
      p_session_token: state.sessionToken,
      p_entry_id: entry.id,
    });
    if (error) throw error;

    state.entries = state.entries.map((item) => (item.id === entry.id ? normalizeEntryResponse(data) : item));
    renderEntries();
    showToast(`${entry.song_title} logged. ${formatNumber(data?.sing_count)} ${Number(data?.sing_count) === 1 ? "sing" : "sings"} total.`);
  } catch (error) {
    console.error("Could not log karaoke sing", error);
    if (isSessionError(error)) {
      await expireSession();
      return;
    }
    showToast(friendlyDataError(error), "error");
  } finally {
    button.disabled = false;
    button.classList.remove("is-loading");
    button.removeAttribute("aria-busy");
  }
}

function closeActionMenus() {
  document.querySelectorAll(".entry-row.menu-open").forEach((row) => {
    row.classList.remove("menu-open");
    row.querySelector(".row-menu-button").setAttribute("aria-expanded", "false");
    row.querySelector(".row-menu").setAttribute("aria-hidden", "true");
  });
}

async function loadEntries() {
  elements.listLoading.hidden = false;
  elements.entryList.hidden = true;
  elements.emptyState.hidden = true;
  elements.resultsLabel.textContent = "Loading your songs...";

  const { data, error } = await supabase.rpc("list_karaoke_entries", {
    p_session_token: state.sessionToken,
  });

  elements.listLoading.hidden = true;

  if (error) {
    console.error("Could not load karaoke entries", error);
    if (isSessionError(error)) {
      await expireSession();
      return;
    }
    state.entries = [];
    renderLoadError(friendlyDataError(error));
    return;
  }

  state.entries = (data || []).map(normalizeEntryResponse);
  renderEntries();
}

/* --------------------------------------------------------- create / edit */

async function createEntry(input) {
  const entry = cleanEntry(input);
  const { data, error } = await supabase.rpc("create_karaoke_entry", {
    p_session_token: state.sessionToken,
    p_karaoke_number: entry.karaoke_number,
    p_song_title: entry.song_title,
    p_singer: entry.singer,
  });
  if (error) throw error;
  const normalized = normalizeEntryResponse(data);
  state.entries.unshift(normalized);
  return normalized;
}

async function handleAddSubmit(event) {
  event.preventDefault();
  const entry = cleanEntry({
    karaokeNumber: elements.addNumber.value,
    song: elements.addSong.value,
    singer: elements.addSinger.value,
  });
  const validationError = validateEntry(entry);
  if (validationError) {
    setMessage(elements.addError, validationError);
    return;
  }

  setMessage(elements.addError);
  setButtonLoading(elements.addSubmit, true);

  try {
    await createEntry({
      karaokeNumber: elements.addNumber.value,
      song: elements.addSong.value,
      singer: elements.addSinger.value,
    });
    elements.addForm.reset();
    renderEntries();
    showToast("Song added to your songbook.");
    setActiveTab("songs");
  } catch (error) {
    console.error("Could not add karaoke entry", error);
    if (isSessionError(error)) {
      await expireSession();
      return;
    }
    setMessage(elements.addError, friendlyDataError(error));
  } finally {
    setButtonLoading(elements.addSubmit, false);
  }
}

function openEntryDialog(entry = null) {
  state.editingId = entry?.id || null;
  elements.entryNumber.value = entry?.karaoke_number || "";
  elements.entrySong.value = entry?.song_title || "";
  elements.entrySinger.value = entry?.singer || "";
  setMessage(elements.entryError);
  elements.entryDialog.showModal();
  requestAnimationFrame(() => elements.entryNumber.focus());
}

function closeEntryDialog() {
  if (elements.entrySubmit.disabled) return;
  elements.entryDialog.close();
  elements.entryForm.reset();
  state.editingId = null;
  setMessage(elements.entryError);
}

async function handleEntrySubmit(event) {
  event.preventDefault();
  const entry = cleanEntry({
    karaokeNumber: elements.entryNumber.value,
    song: elements.entrySong.value,
    singer: elements.entrySinger.value,
  });
  const validationError = validateEntry(entry);
  if (validationError) {
    setMessage(elements.entryError, validationError);
    return;
  }

  setMessage(elements.entryError);
  setButtonLoading(elements.entrySubmit, true);

  try {
    const result = await supabase.rpc("update_karaoke_entry", {
      p_session_token: state.sessionToken,
      p_entry_id: state.editingId,
      p_karaoke_number: entry.karaoke_number,
      p_song_title: entry.song_title,
      p_singer: entry.singer,
    });
    if (result.error) throw result.error;

    state.entries = state.entries.map((item) => (item.id === state.editingId ? normalizeEntryResponse(result.data) : item));
    setButtonLoading(elements.entrySubmit, false);
    closeEntryDialog();
    renderEntries();
    showToast("Karaoke entry updated.");
  } catch (error) {
    console.error("Could not save karaoke entry", error);
    if (isSessionError(error)) {
      setButtonLoading(elements.entrySubmit, false);
      closeEntryDialog();
      await expireSession();
      return;
    }
    setMessage(elements.entryError, friendlyDataError(error));
  } finally {
    setButtonLoading(elements.entrySubmit, false);
  }
}

function openDeleteDialog(entry) {
  state.deletingId = entry.id;
  elements.confirmSong.textContent = `${entry.karaoke_number} / ${entry.song_title} by ${entry.singer}`;
  setMessage(elements.confirmError);
  elements.confirmDialog.showModal();
  requestAnimationFrame(() => elements.confirmDelete.focus());
}

function closeConfirmDialog() {
  if (elements.confirmDelete.disabled) return;
  elements.confirmDialog.close();
  state.deletingId = null;
  setMessage(elements.confirmError);
}

async function deleteEntry() {
  if (!state.deletingId) return;
  const deletingId = state.deletingId;
  setButtonLoading(elements.confirmDelete, true);
  setMessage(elements.confirmError);

  try {
    const { error } = await supabase.rpc("delete_karaoke_entry", {
      p_session_token: state.sessionToken,
      p_entry_id: deletingId,
    });
    if (error) throw error;
    state.entries = state.entries.filter((entry) => entry.id !== deletingId);
    setButtonLoading(elements.confirmDelete, false);
    closeConfirmDialog();
    renderEntries();
    showToast("Song removed from your songbook.");
  } catch (error) {
    console.error("Could not delete karaoke entry", error);
    if (isSessionError(error)) {
      setButtonLoading(elements.confirmDelete, false);
      closeConfirmDialog();
      await expireSession();
      return;
    }
    setMessage(elements.confirmError, friendlyDataError(error));
  } finally {
    setButtonLoading(elements.confirmDelete, false);
  }
}

function closeDialogFromBackdrop(event) {
  const dialog = event.currentTarget;
  const bounds = dialog.getBoundingClientRect();
  const isBackdrop =
    event.clientX < bounds.left ||
    event.clientX > bounds.right ||
    event.clientY < bounds.top ||
    event.clientY > bounds.bottom;
  if (!isBackdrop) return;
  if (dialog === elements.entryDialog) closeEntryDialog();
  if (dialog === elements.confirmDialog) closeConfirmDialog();
}

/* -------------------------------------------------------------- discover */

function friendlyDiscoverError(error) {
  const message = (error?.message || error?.error || "").toLowerCase();
  if (message.includes("server_not_configured")) return "AI search is not configured yet. Set GEMINI_API_KEY in Supabase.";
  if (message.includes("empty_prompt")) return "Type a vibe or theme first.";
  if (message.includes("ai_unavailable")) return "The AI is unavailable right now. Try again in a moment.";
  if (message.includes("fetch") || message.includes("network")) return "Unable to connect. Check your internet connection.";
  return "Could not get suggestions. Please try again.";
}

function setDiscoverEmpty(message) {
  elements.discoverResults.hidden = true;
  elements.discoverResults.replaceChildren();
  elements.discoverEmptyText.textContent = message;
  elements.discoverEmpty.hidden = false;
}

async function handleDiscoverSubmit(event) {
  event.preventDefault();
  const prompt = elements.discoverInput.value.trim();
  if (!prompt) {
    setDiscoverEmpty("Type a vibe or theme, like \"breakup songs\" or \"90s OPM\".");
    elements.discoverInput.focus();
    return;
  }

  setButtonLoading(elements.discoverSubmit, true);
  elements.discoverEmpty.hidden = true;
  elements.discoverResults.hidden = true;
  elements.discoverLoading.hidden = false;

  try {
    const { data, error } = await supabase.functions.invoke("discover-songs", {
      body: { prompt },
    });

    // A non-2xx edge response arrives as a FunctionsHttpError. Read its JSON
    // body so we can show the real reason (missing key, AI down, etc.).
    if (error) {
      let detail = error;
      if (typeof error.context?.json === "function") {
        try {
          detail = await error.context.json();
        } catch {
          // Keep the original error when the body is not JSON.
        }
      }
      throw detail;
    }

    const suggestions = Array.isArray(data?.suggestions) ? data.suggestions : [];
    renderSuggestions(suggestions);
  } catch (error) {
    console.error("Could not get song suggestions", error);
    setDiscoverEmpty(friendlyDiscoverError(error));
  } finally {
    elements.discoverLoading.hidden = true;
    setButtonLoading(elements.discoverSubmit, false);
  }
}

function renderSuggestions(suggestions) {
  elements.discoverResults.replaceChildren();

  if (!suggestions.length) {
    setDiscoverEmpty("No suggestions came back. Try describing it a different way.");
    return;
  }

  elements.discoverEmpty.hidden = true;
  elements.discoverResults.hidden = false;
  suggestions.forEach((suggestion, index) => {
    elements.discoverResults.append(createSuggestionCard(suggestion, index));
  });
}

function createSuggestionCard(suggestion, index) {
  const card = document.createElement("li");
  card.className = "suggestion-card";
  card.style.setProperty("--row-index", Math.min(index, 8));
  card.innerHTML = `
    <div class="suggestion-copy">
      <strong></strong>
      <span class="suggestion-artist"></span>
      <span class="suggestion-reason"></span>
    </div>
    <button class="suggestion-add" type="button" aria-label="Add to songbook">${icons.plus}<span class="button-spinner" aria-hidden="true"></span></button>`;

  card.querySelector("strong").textContent = suggestion.song_title;
  card.querySelector(".suggestion-artist").textContent = suggestion.artist;
  const reason = card.querySelector(".suggestion-reason");
  if (suggestion.reason) {
    reason.textContent = suggestion.reason;
  } else {
    reason.hidden = true;
  }

  const addButton = card.querySelector(".suggestion-add");
  addButton.addEventListener("click", () => addSuggestion(suggestion, card, addButton));
  return card;
}

async function addSuggestion(suggestion, card, button) {
  if (button.disabled) return;
  setButtonLoading(button, true);

  try {
    await createEntry(suggestionToEntryInput(suggestion));
    renderEntries();
    card.classList.add("is-added");
    button.innerHTML = icons.check;
    button.disabled = true;
    button.setAttribute("aria-label", `${suggestion.song_title} added`);
    showToast(`${suggestion.song_title} added. Set its number in Songs.`);
  } catch (error) {
    console.error("Could not add suggested song", error);
    setButtonLoading(button, false);
    if (isSessionError(error)) {
      await expireSession();
      return;
    }
    showToast(friendlyDataError(error), "error");
  }
}

/* ---------------------------------------------------------------- tabs */

function setActiveTab(tab) {
  if (!TAB_TITLES[tab]) tab = "songs";
  state.activeTab = tab;
  elements.tabTitle.textContent = TAB_TITLES[tab];

  Object.entries(elements.tabPanels).forEach(([name, panel]) => {
    panel.hidden = name !== tab;
  });
  elements.navItems.forEach((item) => {
    item.classList.toggle("is-active", item.dataset.tab === tab);
    item.setAttribute("aria-current", item.dataset.tab === tab ? "page" : "false");
  });

  if (tab === "discover") {
    requestAnimationFrame(() => elements.discoverInput.focus());
  }
  if (tab === "add") {
    requestAnimationFrame(() => elements.addNumber.focus());
  }
}

/* --------------------------------------------------------------- profile */

function renderProfile() {
  const name = state.user?.name || "Singer";
  elements.profileName.textContent = name;
  elements.profileInitial.textContent = name.trim().charAt(0).toLocaleUpperCase() || "K";

  const hasAnswer = Boolean(state.user?.has_security_answer);
  elements.profileRecovery.textContent = hasAnswer ? "Recovery is set up" : "Recovery not set up";
  elements.profileRecovery.classList.toggle("is-set", hasAnswer);
  elements.answerSubmitLabel.textContent = hasAnswer ? "Update answer" : "Save answer";
}

async function handleAnswerSubmit(event) {
  event.preventDefault();
  const answerError = validateSecurityAnswer(elements.answerInput.value);
  if (answerError) {
    setMessage(elements.answerError, answerError);
    return;
  }

  setMessage(elements.answerError);
  setButtonLoading(elements.answerSubmit, true);

  try {
    const { data, error } = await supabase.rpc("set_security_answer", {
      p_session_token: state.sessionToken,
      p_security_answer: elements.answerInput.value,
    });
    if (error) throw error;

    state.user = data || state.user;
    elements.answerForm.reset();
    renderProfile();
    updateAnswerBanner();
    showToast("Security answer saved.");
  } catch (error) {
    console.error("Could not save security answer", error);
    if (isSessionError(error)) {
      await expireSession();
      return;
    }
    setMessage(elements.answerError, friendlyAuthError(error));
  } finally {
    setButtonLoading(elements.answerSubmit, false);
  }
}

function updateAnswerBanner() {
  const needsAnswer = Boolean(state.user) && !state.user.has_security_answer && !state.answerBannerDismissed;
  elements.answerBanner.hidden = !needsAnswer;
}

async function handleLogout() {
  elements.logoutButton.disabled = true;
  const token = state.sessionToken;
  try {
    const { error } = await supabase.rpc("logout_account", { p_session_token: token });
    if (error) throw error;
    showToast("You have been signed out.");
  } catch (error) {
    console.error("Sign out failed", error);
    showToast("Signed out on this device. The server session will expire automatically.", "error");
  } finally {
    clearSessionToken();
    state.authResolved = false;
    await applyAccount(null);
    elements.logoutButton.disabled = false;
  }
}

/* ------------------------------------------------------------------ auth */

function setAuthScreen(screen) {
  state.authScreen = screen;
  const isReset = screen === "reset";
  elements.authCard.hidden = isReset;
  elements.resetCard.hidden = !isReset;
  if (isReset) {
    setMessage(elements.resetError);
    requestAnimationFrame(() => elements.resetName.focus());
  } else {
    setMessage(elements.authError);
  }
}

function setAuthMode(mode) {
  state.authMode = mode;
  const isSignup = mode === "signup";
  elements.loginTab.classList.toggle("is-active", !isSignup);
  elements.signupTab.classList.toggle("is-active", isSignup);
  elements.loginTab.setAttribute("aria-selected", String(!isSignup));
  elements.signupTab.setAttribute("aria-selected", String(isSignup));
  elements.authEyebrow.textContent = isSignup ? "Start your songbook" : "Welcome back";
  elements.authTitle.textContent = isSignup ? "Create your account" : "Sign in to your songbook";
  elements.authDescription.textContent = isSignup
    ? "One name, one password, and the mic is yours."
    : "Your setlist is waiting for you.";
  elements.authSubmitLabel.textContent = isSignup ? "Create account" : "Sign in";
  elements.authSwitch.textContent = isSignup ? "Sign in instead" : "Create an account";
  elements.authFootnote.firstChild.textContent = isSignup ? "Already have an account? " : "New to HimiGora? ";
  elements.authPassword.autocomplete = isSignup ? "new-password" : "current-password";
  elements.signupAnswerGroup.hidden = !isSignup;
  elements.forgotLink.hidden = isSignup;
  setMessage(elements.authError);
}

async function handleAuthSubmit(event) {
  event.preventDefault();
  setMessage(elements.authError);

  const displayName = cleanAccountName(elements.authName.value);
  const password = elements.authPassword.value;
  const isSignup = state.authMode === "signup";

  if (!displayName) {
    setMessage(elements.authError, "Enter your name.");
    elements.authName.focus();
    return;
  }
  const passwordError = validatePassword(password);
  if (passwordError) {
    setMessage(elements.authError, passwordError);
    elements.authPassword.focus();
    return;
  }

  let securityAnswer = null;
  if (isSignup) {
    const rawAnswer = elements.authAnswer.value.trim();
    if (rawAnswer) {
      const answerError = validateSecurityAnswer(rawAnswer);
      if (answerError) {
        setMessage(elements.authError, answerError);
        elements.authAnswer.focus();
        return;
      }
      securityAnswer = rawAnswer;
    }
  }

  setButtonLoading(elements.authSubmit, true);

  try {
    let data;
    let error;
    if (isSignup) {
      ({ data, error } = await supabase.rpc("register_account", {
        p_name: displayName,
        p_password: password,
        p_security_answer: securityAnswer,
      }));
    } else {
      ({ data, error } = await supabase.rpc("login_account", {
        p_name: displayName,
        p_password: password,
      }));
    }

    if (error) throw error;
    if (!data?.session_token || !data?.account) throw new Error("Invalid account response");

    elements.authForm.reset();
    elements.signupAnswerGroup.hidden = !isSignup;
    storeSessionToken(data.session_token);
    if (isSignup) showToast("Account created. Welcome to HimiGora!");
    state.authResolved = false;
    state.answerBannerDismissed = false;
    await applyAccount(data.account);
  } catch (error) {
    console.error("Authentication failed", error);
    setMessage(elements.authError, friendlyAuthError(error));
  } finally {
    setButtonLoading(elements.authSubmit, false);
  }
}

async function handleResetSubmit(event) {
  event.preventDefault();
  setMessage(elements.resetError);

  const displayName = cleanAccountName(elements.resetName.value);
  const answer = elements.resetAnswer.value;
  const password = elements.resetPassword.value;

  if (!displayName) {
    setMessage(elements.resetError, "Enter your account name.");
    elements.resetName.focus();
    return;
  }
  const answerError = validateSecurityAnswer(answer);
  if (answerError) {
    setMessage(elements.resetError, answerError);
    elements.resetAnswer.focus();
    return;
  }
  const passwordError = validatePassword(password);
  if (passwordError) {
    setMessage(elements.resetError, passwordError);
    elements.resetPassword.focus();
    return;
  }

  setButtonLoading(elements.resetSubmit, true);

  try {
    const { error } = await supabase.rpc("reset_password_with_answer", {
      p_name: displayName,
      p_security_answer: answer,
      p_new_password: password,
    });
    if (error) throw error;

    elements.resetForm.reset();
    setAuthScreen("signin");
    setAuthMode("login");
    elements.authName.value = displayName;
    showToast("Password updated. Sign in with your new password.");
    elements.authPassword.focus();
  } catch (error) {
    console.error("Password reset failed", error);
    setMessage(elements.resetError, friendlyAuthError(error));
  } finally {
    setButtonLoading(elements.resetSubmit, false);
  }
}

function setPasswordVisibility() {
  const willShow = elements.authPassword.type === "password";
  elements.authPassword.type = willShow ? "text" : "password";
  elements.passwordToggle.classList.toggle("is-visible", willShow);
  elements.passwordToggle.setAttribute("aria-label", willShow ? "Hide password" : "Show password");
  elements.authPassword.focus();
}

async function applyAccount(account) {
  const nextUser = account || null;
  const currentUserId = state.user?.id || null;

  if (state.authResolved && nextUser?.id === currentUserId) return;

  state.authResolved = true;
  state.user = nextUser;

  if (!nextUser) {
    state.entries = [];
    state.answerBannerDismissed = false;
    updatePlaylistStats();
    elements.appView.hidden = true;
    elements.authView.hidden = false;
    setAuthScreen("signin");
    elements.authName.focus({ preventScroll: true });
    return;
  }

  elements.authView.hidden = true;
  elements.appView.hidden = false;
  setActiveTab("songs");
  renderProfile();
  updateAnswerBanner();
  await loadEntries();
}

async function expireSession() {
  clearSessionToken();
  state.authResolved = false;
  await applyAccount(null);
  showToast("Your session expired. Sign in again.", "error");
}

/* ------------------------------------------------------------- bootstrap */

function initializeEvents() {
  // Security question text in every spot it appears.
  elements.signupQuestionText.textContent = SECURITY_QUESTION;
  elements.resetQuestionText.textContent = SECURITY_QUESTION;
  elements.profileQuestionText.textContent = SECURITY_QUESTION;

  // Auth
  elements.authForm.addEventListener("submit", handleAuthSubmit);
  elements.loginTab.addEventListener("click", () => setAuthMode("login"));
  elements.signupTab.addEventListener("click", () => setAuthMode("signup"));
  elements.authSwitch.addEventListener("click", () => setAuthMode(state.authMode === "login" ? "signup" : "login"));
  elements.passwordToggle.addEventListener("click", setPasswordVisibility);
  elements.forgotLink.addEventListener("click", () => {
    elements.resetName.value = cleanAccountName(elements.authName.value);
    setAuthScreen("reset");
  });
  elements.resetForm.addEventListener("submit", handleResetSubmit);
  elements.resetBack.addEventListener("click", () => setAuthScreen("signin"));

  // Tabs
  elements.navItems.forEach((item) => {
    item.addEventListener("click", () => setActiveTab(item.dataset.tab));
  });

  // Banner
  elements.answerBannerGo.addEventListener("click", () => {
    setActiveTab("profile");
    requestAnimationFrame(() => elements.answerInput.focus());
  });
  elements.answerBannerDismiss.addEventListener("click", () => {
    state.answerBannerDismissed = true;
    updateAnswerBanner();
  });

  // Songs
  elements.libraryFilterButtons.forEach((button) => {
    button.addEventListener("click", () => updateLibraryFilter(button.dataset.libraryFilter));
  });
  elements.emptyAddButton.addEventListener("click", () => setActiveTab("add"));
  elements.searchInput.addEventListener("input", (event) => {
    state.searchQuery = event.target.value;
    elements.clearSearch.hidden = !state.searchQuery;
    renderEntries();
  });
  elements.searchFieldSelect.addEventListener("change", (event) => {
    state.searchField = event.target.value;
    const fieldLabel = state.searchField === "song_title" ? "song" : "singer";
    elements.searchInput.placeholder = `Search by ${fieldLabel}...`;
    elements.searchInput.setAttribute("aria-label", `Search songbook by ${fieldLabel}`);
    renderEntries();
    elements.searchInput.focus();
  });
  elements.clearSearch.addEventListener("click", () => {
    elements.searchInput.value = "";
    state.searchQuery = "";
    elements.clearSearch.hidden = true;
    renderEntries();
    elements.searchInput.focus();
  });

  // Discover
  elements.discoverForm.addEventListener("submit", handleDiscoverSubmit);
  elements.discoverChips.addEventListener("click", (event) => {
    const chip = event.target.closest(".example-chip");
    if (!chip) return;
    elements.discoverInput.value = chip.dataset.prompt;
    elements.discoverForm.requestSubmit();
  });

  // Add
  elements.addForm.addEventListener("submit", handleAddSubmit);

  // Profile
  elements.answerForm.addEventListener("submit", handleAnswerSubmit);
  elements.logoutButton.addEventListener("click", handleLogout);

  // Dialogs
  elements.entryForm.addEventListener("submit", handleEntrySubmit);
  elements.confirmDelete.addEventListener("click", deleteEntry);
  document.querySelectorAll("[data-close-dialog]").forEach((button) => button.addEventListener("click", closeEntryDialog));
  document.querySelectorAll("[data-close-confirm]").forEach((button) => button.addEventListener("click", closeConfirmDialog));
  elements.entryDialog.addEventListener("click", closeDialogFromBackdrop);
  elements.confirmDialog.addEventListener("click", closeDialogFromBackdrop);
  elements.entryDialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeEntryDialog();
  });
  elements.confirmDialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeConfirmDialog();
  });

  document.addEventListener("click", closeActionMenus);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeActionMenus();
  });
}

async function boot() {
  initializeTheme();
  initializeEvents();
  setAuthMode("login");
  setAuthScreen("signin");
  clearLegacyAuthSession();

  try {
    const storedToken = getStoredSessionToken();
    if (!storedToken) {
      await applyAccount(null);
    } else {
      const { data, error } = await supabase.rpc("get_current_account", {
        p_session_token: storedToken,
      });
      if (error) throw error;
      if (!data) {
        clearSessionToken();
        await applyAccount(null);
      } else {
        state.sessionToken = storedToken;
        await applyAccount(data);
      }
    }
  } catch (error) {
    console.error("Could not restore session", error);
    clearSessionToken();
    state.authResolved = false;
    await applyAccount(null);
    setMessage(elements.authError, friendlyAuthError(error));
  } finally {
    document.body.classList.remove("is-booting");
    elements.bootScreen.hidden = true;
  }
}

boot();
