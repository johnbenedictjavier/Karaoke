# karaokeHub

A responsive personal karaoke songbook built with HTML, CSS, JavaScript, and Supabase. Each account has a private playlist protected by Supabase Row Level Security.

## Supabase setup

The database must be configured before account creation and playlist features will work.

1. Open the [Supabase dashboard](https://supabase.com/dashboard/project/nirtjqjcqaxlrskuvpjy).
2. Open **SQL Editor**, create a new query, paste `supabase/schema.sql`, and click **Run**.
3. Open **Authentication** > **Sign In / Providers** > **Email**.
4. Keep Email authentication enabled and turn **Confirm email** off.
5. Optionally set the Site URL under **Authentication** > **URL Configuration** to `https://johnbenedictjavier.github.io/Karaoke/`.

Only the publishable Supabase key is included in the browser app. Never add a service-role key to this repository.

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

The interface only asks for a name and password. Supabase Auth requires an email for password authentication, so karaokeHub normalizes the account name, hashes it with SHA-256, and derives an internal non-deliverable email address. The original name is saved as user metadata for display.

Account names are unique and case-insensitive. Passwords are sent directly to Supabase Auth and are never stored in the playlist table or browser storage. Because accounts do not collect a real email address, password recovery is not available.

## Deployment

Pushes to `main` run tests, build the Vite site, and deploy it through GitHub Actions. Before the first deployment, open **Repository Settings** > **Pages** and set **Source** to **GitHub Actions**. The expected site URL is:

`https://johnbenedictjavier.github.io/Karaoke/`

If the initial workflow ran before Pages was enabled, rerun it from the repository's **Actions** tab after selecting the source.
