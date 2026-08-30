# Kasa

Personal browser ledger. You always count in **Kč**. Amounts typed in **€** are converted with the current Czech National Bank EUR fixing (one rate per Czech working day; weekends keep Friday’s number).

No npm packages. Data lives in `.data/kasa.json` (gitignored). Passwords are hashed with scrypt and never sent back to the browser.

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

The first visit is **Create account**. After that, only that email can log in. Nobody else can register.

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
4. Generate a public domain, open it, **register once**, then log in.
5. Enable sleep if you want it cheap. Do not add Postgres.

The volume holds both the ledger and the password hash. Without it, a redeploy wipes the account and you would register again against empty data.

Same Dockerfile works on Fly.io.

`APP_PASSWORD` is no longer used. Auth is the in-app account.
