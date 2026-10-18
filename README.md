# HimiGora

A responsive, mobile-first personal karaoke songbook built with HTML, CSS, JavaScript, and Supabase. It uses a custom SQL account system with private, token-authorized playlists, per-song sing history, manual song entry, an AI "Discover" tab for song ideas, and fixed-question password recovery.

## Features

- **Name + password accounts.** No email, no Supabase Auth. Account names are unique and case-insensitive.
- **Password recovery via a security question.** Everyone answers the same fixed question ("What is your favorite song?"). The answer is stored as a bcrypt hash and compared after normalization (case- and whitespace-insensitive). Setting an answer is optional; it is required to recover. Accounts without an answer are prompted (dismissibly) to add one.
- **AI Discover.** Describe a vibe, mood, or era (for example "90s Filipino love songs") and get song suggestions with artist and a short reason. Tap a suggestion to add it to your songbook. Suggestions never include a karaoke number because no reliable cross-brand source exists; the song is saved with a placeholder number you edit from your own machine.
- **Mobile app layout.** A bottom navigation bar with four tabs: Songs, Discover, Add, and Profile.
- **Sing history and stats.** Each "Log sing" records a private event and updates songbook totals.

## Supabase setup

The database must be configured before account creation and playlist features will work. The migration replaces the original Supabase Auth-backed schema and archives its old `karaoke_entries` table in the private schema because old Supabase Auth identities cannot be linked to the new name/password accounts.

1. Open the [Supabase dashboard](https://supabase.com/dashboard/project/nirtjqjcqaxlrskuvpjy).
2. Open **SQL Editor** and run the contents of `supabase/schema.sql`. Rerun it any time the app reports that custom account setup is incomplete. The script is idempotent and safe to run repeatedly; rerun it after pulling changes so the security-answer column and recovery functions exist.
3. Open **Table Editor** > **accounts** to view registered account names and password hashes.

Only the publishable Supabase key is included in the browser app (`src/config.js`). Never add a service-role key or any API key to this repository or the frontend.

### AI Discover: Gemini edge function

The Discover tab calls a Supabase Edge Function (`supabase/functions/discover-songs`) that talks to the Google Gemini API. The Gemini key lives only in the edge function as a Supabase secret; it never reaches the static browser app.

1. Get a Google Gemini API key from [Google AI Studio](https://aistudio.google.com/app/apikey).
2. Store it as a function secret:

   ```bash
   supabase secrets set GEMINI_API_KEY=your-key-here
   ```

3. Deploy the function:

   ```bash
   supabase functions deploy discover-songs
   ```

The function accepts `{ "prompt": "..." }` and returns `{ "suggestions": [{ "song_title", "artist", "reason" }] }`. On failure it returns an `{ "error": "..." }` body with a non-200 status, which the app maps to a friendly message. If the Gemini key is missing the function returns `server_not_configured` and the Discover tab shows a setup hint.

## Local development

```bash
npm install
npm run dev
```

Open the local URL shown by Vite. The Discover tab needs the deployed edge function and its secret to return results; the rest of the app works against the database alone.

## Checks

```bash
npm test
npm run build
npm run preview
```

`npm test` runs the Node unit tests (`node --test`), covering the input helpers, the security-answer normalization/validation, the AI suggestion mapping, and the edge function's response normalizer. The PostgreSQL schema test (`tests/schema.test.sql`) runs in CI against a Postgres service.

## Authentication and recovery design

HimiGora does not use Supabase Auth or create `auth.users` records. Account names and bcrypt password hashes are stored in `public.accounts`. Original passwords are never stored and cannot be recovered from those hashes.

Successful registration or login returns a random 30-day session token; only its SHA-256 digest is stored in `private.account_sessions`. Direct browser access to all tables is revoked. Every account and playlist operation goes through a narrowly granted `SECURITY DEFINER` SQL function that validates the session before reading or changing data. The session token is kept in browser local storage so login survives a refresh.

Password recovery uses a single fixed security question. The optional answer is normalized (NFKC, trimmed, lowercased, collapsed whitespace) and stored as a bcrypt hash in `public.accounts.security_answer_hash`. `reset_password_with_answer` verifies the answer with a constant-time comparison (using a dummy hash when the account or answer is absent) and returns a single generic error so it never reveals whether an account exists or has recovery set up. A successful reset updates the password hash and invalidates every existing session for that account.

## Deployment

Pull requests run the JavaScript and PostgreSQL integration tests. Pushes to `main` repeat those checks, build the Vite site, and deploy it through GitHub Actions. Deploy the `discover-songs` edge function and set `GEMINI_API_KEY` separately with the Supabase CLI; GitHub Pages serves only the static frontend. Before the first deployment, open **Repository Settings** > **Pages** and set **Source** to **GitHub Actions**. The expected site URL is:

`https://johnbenedictjavier.github.io/Karaoke/`

If the initial workflow ran before Pages was enabled, rerun it from the repository's **Actions** tab after selecting the source.
