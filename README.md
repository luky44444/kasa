# Kasa

Personal browser ledger. You always count in **Kč**. Amounts typed in **€** are converted with the current Czech National Bank EUR fixing (one rate per Czech working day; weekends keep Friday’s number).

No npm packages. Locally, data lives in `.data/kasa.json` (gitignored). On Railway it lives in **Supabase** so a redeploy does not wipe the account. Password and PIN are hashed with scrypt and never sent back to the browser.

## Run locally

Needs Node 22.

```bash
npm run dev
```

Or:

```bash
node --experimental-strip-types src/server.ts
```

Open http://127.0.0.1:3000

Copy `.env.example` to `.env` if you want local Supabase. The server reads that file on boot. Without `SUPABASE_URL`, Kasa uses `.data/kasa.json` only.

1. **Create account** once with email + password. After that the app only shows **Log in**.
2. After login you go straight to the ledger. Login stays remembered on this browser.
3. **PIN is optional** in Settings. If you add one, it is a second lock when you open Kasa and after 5 minutes idle.
4. **Log out** in Settings forgets the login. **Lock with PIN** only asks for the PIN again.

On your phone, same Wi-Fi: `http://YOUR-PC-IP:3000`

- **Load August example** fills the sample month.
- **Spend** / **Income** adds a row. Switch Kč / €. Euro rows keep the original € and add Kč using the live ČNB rate.

## Railway

The ledger is one JSON document in Supabase (`public.kasa_ledger`). That is what keeps login and transactions across deploys. Do **not** put `VOLUME` in the Dockerfile.

1. Create a Supabase project.
2. SQL editor → run `supabase/schema.sql` (creates the table plus `kasa_load` / `kasa_save`).
3. Insert a long random `store_secret` into `kasa_meta` if the migration did not already.
4. New Railway project → deploy this GitHub repo (`luky44444/kasa`).
5. Variables:
   - `SUPABASE_URL=https://YOUR_PROJECT.supabase.co`
   - `SUPABASE_ANON_KEY=...` (anon/publishable key; never ship it to the browser for this app)
   - `KASA_STORE_SECRET=...` (same value as `kasa_meta.store_secret`)
   - `HOST=0.0.0.0`
   - `NODE_ENV=production` (the Dockerfile already sets this)
6. Generate a public domain, open it, register once, then log in.
7. Enable sleep if you want it cheap.

A Railway volume is optional. With Supabase set, Kasa still tries to write a local cache file, but the cloud row is the source of truth.

Same Dockerfile works on Fly.io.

`APP_PASSWORD` is no longer used. Auth is the in-app email/password account. PIN is optional.
