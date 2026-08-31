# Kasa

Personal browser ledger. You always count in **Kč**. Amounts typed in **€** are converted with the current Czech National Bank EUR fixing (one rate per Czech working day; weekends keep Friday’s number).

No npm packages. Data lives in `.data/kasa.json` (gitignored). Password and PIN are hashed with scrypt and never sent back to the browser.

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

1. **Create account** once with email + password. After that the app only shows **Log in**.
2. After login you go straight to the ledger. Login stays remembered on this browser.
3. **PIN is optional** in Settings. If you add one, it is a second lock when you open Kasa and after 5 minutes idle.
4. **Log out** in Settings forgets the login. **Lock with PIN** only asks for the PIN again.

On your phone, same Wi-Fi: `http://YOUR-PC-IP:3000`

- **Load August example** fills the sample month.
- **Spend** / **Income** adds a row. Switch Kč / €. Euro rows keep the original € and add Kč using the live ČNB rate.

## Railway

Do **not** put `VOLUME` in the Dockerfile. Railway rejects that. Create the disk in the Railway dashboard instead.

1. New project → deploy this GitHub repo (`luky44444/kasa`).
2. Variables:
   - `KASA_DATA=/data/kasa.json`
   - `HOST=0.0.0.0`
   - `NODE_ENV=production` (the Dockerfile already sets this)
3. Settings → Volumes → add a volume, mount path `/data`.
4. Generate a public domain, open it, register once, then log in.
5. Enable sleep if you want it cheap. Do not add Postgres.

The volume holds the ledger, password hash, and optional PIN hash. Without it, a redeploy wipes the account.

Same Dockerfile works on Fly.io.

`APP_PASSWORD` is no longer used. Auth is the in-app email/password account. PIN is optional.
