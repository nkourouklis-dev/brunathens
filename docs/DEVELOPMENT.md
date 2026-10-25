# Kerdiseto — Οδηγός Ανάπτυξης

## Απαιτήσεις

- Node.js 20+
- Cloudflare account με πρόσβαση στο Pages project `kerdiseto` και στη βάση D1 `cafe-orders-db`

## Δομή

- `frontend/src/` — React (`loyalty/`: κάρτα πελάτη, διαχείριση, κονσόλα πλατφόρμας)
- `frontend/functions/api/loyalty/` — API για πελάτες, υπαλλήλους και ιδιοκτήτες
- `frontend/functions/api/platform/` — API διαχειριστή πλατφόρμας (δημιουργία, διαγραφή, κωδικοί)
- `worker/migrations/` — SQL migrations της βάσης

## Local

```bash
cd frontend
npm install
npm run dev
```

## Deploy

Από τον φάκελο `frontend`:

```bash
npm run build
npx wrangler pages deploy dist --project-name kerdiseto --branch master
```

## Migrations

```bash
cd frontend
npx wrangler d1 execute cafe-orders-db --remote --file ../worker/migrations/<αρχείο>.sql
```

Για τοπική βάση, αντί για `--remote` βάλε `--local`.

## Secrets

```bash
cd frontend
npx wrangler pages secret put ADMIN_ACCESS_KEY --project-name kerdiseto
```

Το `ADMIN_ACCESS_KEY` είναι ο κωδικός πλατφόρμας για το `/platform`. Μετά από αλλαγή secret χρειάζεται νέο deploy. Η πλήρης λίστα είναι στο [LOYALTY.md](LOYALTY.md).
