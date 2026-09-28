import { createClient } from "@supabase/supabase-js";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "./config.js";
import {
  accountNameToEmail,
  cleanAccountName,
  cleanEntry,
  filterEntries,
  normalizeAccountName,
  validateEntry,
} from "./utils.js";
import "./styles.css";

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});

const icons = {
  more: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="5" r="1.5"></circle><circle cx="12" cy="12" r="1.5"></circle><circle cx="12" cy="19" r="1.5"></circle></svg>',
  edit: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 16-.8 4.8L8 20l11-11-4-4L4 16Z"></path><path d="m13.5 6.5 4 4"></path></svg>',
  trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"></path></svg>',
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"></path></svg>',
  close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17"></path></svg>',
};

const elements = {
  bootScreen: document.querySelector("#boot-screen"),
  authView: document.querySelector("#auth-view"),
  appView: document.querySelector("#app-view"),
  authForm: document.querySelector("#auth-form"),
  authName: document.querySelector("#auth-name"),
  authPassword: document.querySelector("#auth-password"),
  authError: document.querySelector("#auth-error"),
  authSubmit: document.querySelector("#auth-submit"),
  authSubmitLabel: document.querySelector("#auth-submit-label"),
  authEyebrow: document.querySelector("#auth-eyebrow"),
  authTitle: document.querySelector("#auth-title"),
  authDescription: document.querySelector("#auth-description"),
  authFootnote: document.querySelector("#auth-footnote"),
  authSwitch: document.querySelector("#auth-switch"),
  loginTab: document.querySelector("#login-tab"),
  signupTab: document.querySelector("#signup-tab"),
  passwordToggle: document.querySelector("#password-toggle"),
  userName: document.querySelector("#user-name"),
  userInitial: document.querySelector("#user-initial"),
  logoutButton: document.querySelector("#logout-button"),
  playlistSummary: document.querySelector("#playlist-summary"),
  addEntryButton: document.querySelector("#add-entry-button"),
  emptyAddButton: document.querySelector("#empty-add-button"),
  searchInput: document.querySelector("#search-input"),
  searchFieldSelect: document.querySelector("#search-field-select"),
  clearSearch: document.querySelector("#clear-search"),
  resultsLabel: document.querySelector("#results-label"),
  listLoading: document.querySelector("#list-loading"),
  entryList: document.querySelector("#entry-list"),
  emptyState: document.querySelector("#empty-state"),
  emptyTitle: document.querySelector("#empty-title"),
  emptyDescription: document.querySelector("#empty-description"),
  entryDialog: document.querySelector("#entry-dialog"),
  entryForm: document.querySelector("#entry-form"),
  entryDialogEyebrow: document.querySelector("#entry-dialog-eyebrow"),
  entryDialogTitle: document.querySelector("#entry-dialog-title"),
  entryDialogDescription: document.querySelector("#entry-dialog-description"),
  entryNumber: document.querySelector("#entry-number"),
  entrySong: document.querySelector("#entry-song"),
  entrySinger: document.querySelector("#entry-singer"),
  entryError: document.querySelector("#entry-error"),
  entrySubmit: document.querySelector("#entry-submit"),
  entrySubmitLabel: document.querySelector("#entry-submit-label"),
  confirmDialog: document.querySelector("#confirm-dialog"),
  confirmSong: document.querySelector("#confirm-song"),
  confirmError: document.querySelector("#confirm-error"),
  confirmDelete: document.querySelector("#confirm-delete"),
  toastRegion: document.querySelector("#toast-region"),
};

const state = {
  authMode: "login",
  user: null,
  authResolved: false,
  entries: [],
  searchField: "song_title",
  searchQuery: "",
  editingId: null,
  deletingId: null,
};

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
  if (message.includes("invalid login credentials")) return "That name or password is not correct.";
  if (message.includes("already registered") || message.includes("already been registered")) return "That account name is already in use. Try signing in instead.";
  if (message.includes("password") && message.includes("6")) return "Use a password with at least 6 characters.";
  if (message.includes("rate limit")) return "Too many attempts. Wait a moment and try again.";
  if (message.includes("fetch") || message.includes("network")) return "Unable to connect. Check your internet connection and try again.";
  return "Something went wrong. Please try again.";
}

function friendlyDataError(error) {
  if (["42P01", "PGRST204", "PGRST205"].includes(error?.code)) {
    return "Database setup is not complete. Run supabase/schema.sql in the Supabase SQL Editor.";
  }
  if (error?.code === "23514") return "One of the values is too long or invalid.";
  if (error?.message?.toLowerCase().includes("fetch")) return "Unable to connect. Check your internet connection.";
  return "Could not save that change. Please try again.";
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
  elements.authFootnote.firstChild.textContent = isSignup ? "Already have an account? " : "New to karaokeHub? ";
  elements.authPassword.autocomplete = isSignup ? "new-password" : "current-password";
  setMessage(elements.authError);
}

async function handleAuthSubmit(event) {
  event.preventDefault();
  setMessage(elements.authError);

  const displayName = cleanAccountName(elements.authName.value);
  const password = elements.authPassword.value;

  if (!displayName) {
    setMessage(elements.authError, "Enter your name.");
    elements.authName.focus();
    return;
  }
  if (password.length < 6) {
    setMessage(elements.authError, "Use a password with at least 6 characters.");
    elements.authPassword.focus();
    return;
  }

  setButtonLoading(elements.authSubmit, true);

  try {
    const email = await accountNameToEmail(displayName);
    let result;

    if (state.authMode === "signup") {
      result = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            display_name: displayName,
            account_name: normalizeAccountName(displayName),
          },
        },
      });
    } else {
      result = await supabase.auth.signInWithPassword({ email, password });
    }

    if (result.error) throw result.error;

    if (!result.data.session) {
      setMessage(
        elements.authError,
        "Account created, but email confirmation is enabled. Turn off Confirm email in Supabase Authentication settings, then try again.",
      );
      return;
    }

    elements.authPassword.value = "";
    if (state.authMode === "signup") showToast("Account created. Welcome to karaokeHub!");
    await applySession(result.data.session);
  } catch (error) {
    console.error("Authentication failed", error);
    setMessage(elements.authError, friendlyAuthError(error));
  } finally {
    setButtonLoading(elements.authSubmit, false);
  }
}

function setPasswordVisibility() {
  const willShow = elements.authPassword.type === "password";
  elements.authPassword.type = willShow ? "text" : "password";
  elements.passwordToggle.classList.toggle("is-visible", willShow);
  elements.passwordToggle.setAttribute("aria-label", willShow ? "Hide password" : "Show password");
  elements.authPassword.focus();
}

async function applySession(session) {
  const nextUser = session?.user || null;
  const currentUserId = state.user?.id || null;

  if (state.authResolved && nextUser?.id === currentUserId) return;

  state.authResolved = true;
  state.user = nextUser;

  if (!nextUser) {
    state.entries = [];
    elements.appView.hidden = true;
    elements.authView.hidden = false;
    elements.authName.focus({ preventScroll: true });
    return;
  }

  const displayName = nextUser.user_metadata?.display_name || nextUser.user_metadata?.account_name || "Singer";
  elements.userName.textContent = displayName;
  elements.userInitial.textContent = displayName.trim().charAt(0).toLocaleUpperCase() || "K";
  elements.authView.hidden = true;
  elements.appView.hidden = false;
  await loadEntries();
}

async function handleLogout() {
  elements.logoutButton.disabled = true;
  try {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    state.authResolved = false;
    await applySession(null);
    showToast("You have been signed out.");
  } catch (error) {
    console.error("Sign out failed", error);
    showToast("Could not sign out. Please try again.", "error");
  } finally {
    elements.logoutButton.disabled = false;
  }
}

async function loadEntries() {
  elements.listLoading.hidden = false;
  elements.entryList.hidden = true;
  elements.emptyState.hidden = true;
  elements.resultsLabel.textContent = "Loading your songs...";

  const { data, error } = await supabase
    .from("karaoke_entries")
    .select("id, karaoke_number, song_title, singer, created_at, updated_at")
    .order("created_at", { ascending: false });

  elements.listLoading.hidden = true;

  if (error) {
    console.error("Could not load karaoke entries", error);
    state.entries = [];
    renderLoadError(friendlyDataError(error));
    return;
  }

  state.entries = data || [];
  renderEntries();
}

function renderLoadError(message) {
  elements.entryList.hidden = true;
  elements.emptyState.hidden = false;
  elements.emptyTitle.textContent = "Playlist unavailable";
  elements.emptyDescription.textContent = message;
  elements.emptyAddButton.hidden = true;
  elements.resultsLabel.textContent = "Could not load playlist";
}

function renderEntries() {
  const filteredEntries = filterEntries(state.entries, state.searchField, state.searchQuery);
  const hasQuery = Boolean(state.searchQuery.trim());
  const count = state.entries.length;

  elements.listLoading.hidden = true;
  elements.entryList.replaceChildren();
  elements.playlistSummary.textContent = count
    ? `${count} saved ${count === 1 ? "song" : "songs"}, ready for your next session.`
    : "Keep every go-to song close at hand.";
  elements.resultsLabel.textContent = hasQuery
    ? `${filteredEntries.length} of ${count} ${count === 1 ? "song" : "songs"}`
    : `${count} ${count === 1 ? "song" : "songs"}`;

  if (!filteredEntries.length) {
    elements.entryList.hidden = true;
    elements.emptyState.hidden = false;
    elements.emptyAddButton.hidden = hasQuery;
    elements.emptyTitle.textContent = hasQuery ? "No matches found" : "No Karaoke Numbers Yet";
    elements.emptyDescription.textContent = hasQuery
      ? `No ${state.searchField === "song_title" ? "song" : "singer"} matches "${state.searchQuery.trim()}". Try another search.`
      : "Add your first song and start building a setlist that is always ready.";
    return;
  }

  elements.emptyState.hidden = true;
  elements.entryList.hidden = false;
  filteredEntries.forEach((entry, index) => elements.entryList.append(createEntryRow(entry, index)));
}

function createEntryRow(entry, index) {
  const row = document.createElement("li");
  row.className = "entry-row";
  row.style.setProperty("--row-index", Math.min(index, 8));
  row.innerHTML = `
    <div class="entry-number"><span></span></div>
    <div class="entry-copy"><strong></strong><span></span></div>
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

  const menuButton = row.querySelector(".row-menu-button");
  const menu = row.querySelector(".row-menu");
  menuButton.setAttribute("aria-label", `Actions for ${entry.song_title}`);

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

function closeActionMenus() {
  document.querySelectorAll(".entry-row.menu-open").forEach((row) => {
    row.classList.remove("menu-open");
    row.querySelector(".row-menu-button").setAttribute("aria-expanded", "false");
    row.querySelector(".row-menu").setAttribute("aria-hidden", "true");
  });
}

function openEntryDialog(entry = null) {
  state.editingId = entry?.id || null;
  const isEditing = Boolean(entry);
  elements.entryDialogEyebrow.textContent = isEditing ? "Update entry" : "New entry";
  elements.entryDialogTitle.textContent = isEditing ? "Edit karaoke" : "Add karaoke";
  elements.entryDialogDescription.textContent = isEditing
    ? "Make changes to this playlist entry."
    : "Save a song to your personal playlist.";
  elements.entrySubmitLabel.textContent = isEditing ? "Save changes" : "Add to playlist";
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
    let result;
    if (state.editingId) {
      result = await supabase
        .from("karaoke_entries")
        .update(entry)
        .eq("id", state.editingId)
        .select("id, karaoke_number, song_title, singer, created_at, updated_at")
        .single();
    } else {
      result = await supabase
        .from("karaoke_entries")
        .insert(entry)
        .select("id, karaoke_number, song_title, singer, created_at, updated_at")
        .single();
    }

    if (result.error) throw result.error;

    if (state.editingId) {
      state.entries = state.entries.map((item) => (item.id === state.editingId ? result.data : item));
    } else {
      state.entries.unshift(result.data);
    }

    const wasEditing = Boolean(state.editingId);
    setButtonLoading(elements.entrySubmit, false);
    closeEntryDialog();
    renderEntries();
    showToast(wasEditing ? "Karaoke entry updated." : "Song added to your playlist.");
  } catch (error) {
    console.error("Could not save karaoke entry", error);
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
    const { error } = await supabase.from("karaoke_entries").delete().eq("id", deletingId);
    if (error) throw error;
    state.entries = state.entries.filter((entry) => entry.id !== deletingId);
    setButtonLoading(elements.confirmDelete, false);
    closeConfirmDialog();
    renderEntries();
    showToast("Song removed from your playlist.");
  } catch (error) {
    console.error("Could not delete karaoke entry", error);
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

function initializeEvents() {
  elements.authForm.addEventListener("submit", handleAuthSubmit);
  elements.loginTab.addEventListener("click", () => setAuthMode("login"));
  elements.signupTab.addEventListener("click", () => setAuthMode("signup"));
  elements.authSwitch.addEventListener("click", () => setAuthMode(state.authMode === "login" ? "signup" : "login"));
  elements.passwordToggle.addEventListener("click", setPasswordVisibility);
  elements.logoutButton.addEventListener("click", handleLogout);
  elements.addEntryButton.addEventListener("click", () => openEntryDialog());
  elements.emptyAddButton.addEventListener("click", () => openEntryDialog());
  elements.entryForm.addEventListener("submit", handleEntrySubmit);
  elements.confirmDelete.addEventListener("click", deleteEntry);

  elements.searchInput.addEventListener("input", (event) => {
    state.searchQuery = event.target.value;
    elements.clearSearch.hidden = !state.searchQuery;
    renderEntries();
  });

  elements.searchFieldSelect.addEventListener("change", (event) => {
    state.searchField = event.target.value;
    const fieldLabel = state.searchField === "song_title" ? "song" : "singer";
    elements.searchInput.placeholder = `Search by ${fieldLabel}...`;
    elements.searchInput.setAttribute("aria-label", `Search playlist by ${fieldLabel}`);
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

  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    await applySession(data.session);
  } catch (error) {
    console.error("Could not restore session", error);
    state.authResolved = false;
    await applySession(null);
    setMessage(elements.authError, "Unable to connect to karaokeHub. Check your connection and try again.");
  } finally {
    document.body.classList.remove("is-booting");
    elements.bootScreen.hidden = true;
  }

  supabase.auth.onAuthStateChange((_event, session) => {
    window.setTimeout(() => applySession(session), 0);
  });
}

boot();
