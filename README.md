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

## Cheap Railway later

One web service + a volume on `/data`. Enable sleep. Do not add Postgres. Same Dockerfile also works on Fly.io.

Set `APP_PASSWORD` and `KASA_DATA=/data/kasa.json`.
