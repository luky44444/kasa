# Kasa

Personal browser ledger. You always count in **Kč**. Amounts typed in **€** are converted with the current Czech National Bank EUR fixing (one rate per Czech working day; weekends keep Friday’s number).

No npm packages. Data lives in `.data/kasa.json`.

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

On your phone, same Wi-Fi: `http://YOUR-PC-IP:3000`

- **Load August example** fills the sample month.
- `+` adds a row. Switch Kč / €. Euro rows keep the original € and add Kč using the live ČNB rate.
- Leave `APP_PASSWORD` empty on your machine. Set it on Railway so the public URL is locked.

## Railway

Do **not** put `VOLUME` in the Dockerfile. Railway rejects that. Create the disk in the Railway dashboard instead.

1. New project → deploy this GitHub repo (`luky44444/kasa`).
2. Variables:
   - `KASA_DATA=/data/kasa.json`
   - `APP_PASSWORD=` (pick a password; the public URL stays locked)
   - `HOST=0.0.0.0`
3. Settings → Volumes → add a volume, mount path `/data`.
4. Enable sleep if you want it cheap. Do not add Postgres.

Same Dockerfile works on Fly.io.
