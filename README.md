# HimiGora

A responsive personal karaoke songbook built with HTML, CSS, JavaScript, and Supabase. It uses a custom SQL account system with private, token-authorized playlists, per-song sing history, and manual song entry.

## Supabase setup

The database must be configured before account creation and playlist features will work. The migration replaces the original Supabase Auth-backed schema and archives its old `karaoke_entries` table in the private schema because old Supabase Auth identities cannot be linked to the new name/password accounts.

1. Open the [Supabase dashboard](https://supabase.com/dashboard/project/nirtjqjcqaxlrskuvpjy).
2. Open **SQL Editor** and run the contents of `supabase/schema.sql`.
3. Open **Table Editor** > **accounts** to view registered account names and password hashes.

The app uses name/password accounts backed by the database. It does not require email addresses, email confirmation, or Supabase Auth. Rerun the migration if the app reports that custom account setup is incomplete. Each "Log sing" action creates a private sing-history event and updates the songbook totals.

Only the publishable Supabase key is included in the browser app. Never add a service-role key to this repository.

Songs are added from the HimiGora songbook form. Enter the karaoke number, song title, and singer or artist, then use the library search and sing log to keep the setlist ready.

## Local development

```bash
npm install
npm run dev
```

Open the local URL shown by Vite.

## Checks

```bash
npm test
npm run build
npm run preview
```

## Authentication design

HimiGora does not use Supabase Auth or create `auth.users` records. Account names and bcrypt password hashes are stored in `public.accounts`. Original passwords are never stored and cannot be recovered from those hashes.

Account names are unique and case-insensitive. Successful registration or login returns a random 30-day session token; only its SHA-256 digest is stored in `private.account_sessions`. Direct browser access to all tables is revoked. Every account and playlist operation goes through a narrowly granted SQL function that validates the session before reading or changing data.

The session token is stored in browser local storage so login survives a refresh. Password recovery is not available because the application does not collect an email address.

## Deployment

Pull requests run the JavaScript and PostgreSQL integration tests. Pushes to `main` repeat those checks, build the Vite site, and deploy it through GitHub Actions. Before the first deployment, open **Repository Settings** > **Pages** and set **Source** to **GitHub Actions**. The expected site URL is:

`https://johnbenedictjavier.github.io/Karaoke/`

If the initial workflow ran before Pages was enabled, rerun it from the repository's **Actions** tab after selecting the source.
