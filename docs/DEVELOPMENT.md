# BRUN — Οδηγός Ανάπτυξης

## Προαπαιτούμενα

- Node.js 22+
- npm
- Cloudflare account με πρόσβαση στο project `brunathens`
- Git

## Setup

```bash
git clone https://github.com/nkourouklis-dev/brunathens.git
cd brunathens/frontend
npm install
```

## Local Development

### Επιλογή A: Full stack (frontend + functions + D1)

```bash
cd frontend
npm run build
npx wrangler pages dev dist
```

Αυτό σηκώνει τοπικά:
- Frontend στο `http://localhost:8788` (ή όποια port δείξει)
- Functions με πρόσβαση στο **τοπικό** D1 (από `wrangler.toml`)

> ⚠️ Το τοπικό D1 είναι **ξεχωριστό** από το production. Για να γεμίσεις δεδομένα:
> ```bash
> npx wrangler d1 execute cafe-orders-db --local --file ../worker/migrations/0001_initial.sql
> # ...και τα υπόλοιπα migrations
> ```

### Επιλογή B: Μόνο frontend (γρήγορο HMR)

```bash
cd frontend
npm run dev
```

Το Vite dev server τρέχει στο `http://localhost:5173`, αλλά **τα API calls θα αποτύχουν** (δεν υπάρχει proxy πια). Χρήσιμο μόνο για UI development.

## Deployment

### Auto-deploy (κανονικό)
```bash
git add .
git commit -m "περιγραφή"
git push
```
Το Cloudflare Pages χτίζει και κάνει deploy αυτόματα.

### Manual deploy
```bash
cd frontend
npm run build
npx wrangler pages deploy dist --project-name=brunathens
```

## Database Migrations

Οι migrations είναι στο [worker/migrations/](worker/migrations/) (από τον παλιό Worker — δεν μεταφέρθηκαν).

Για νέα migration:
```bash
cd frontend
npx wrangler d1 execute cafe-orders-db --file ./new-migration.sql
```

> ⚠️ Προσοχή: το `--remote` flag είναι default σε νεότερα wrangler. Για τοπικό D1: `--local`.

## Secrets Management

### Αλλαγή admin κωδικού
```bash
cd frontend
echo "νέος-κωδικός" | npx wrangler pages secret put ADMIN_ACCESS_KEY --project-name=brunathens
```

### Αλλαγή VAPID keys
1. Παράγωγη νέων:
   ```bash
   node -e "const wp=require('web-push');const k=wp.generateVAPIDKeys();console.log(k.publicKey);console.log(k.privateKey)"
   ```
2. Ενημέρωσε:
   - `frontend/functions/_lib/shared.js` → `VAPID_PUBLIC_KEY`
   - `frontend/src/App.jsx` → `VAPID_PUBLIC_KEY`
3. Βάλε το private στο dashboard:
   ```bash
   echo "νέο-private-key" | npx wrangler pages secret put VAPID_PRIVATE_KEY --project-name=brunathens
   ```
4. Redeploy (push)

## Testing

```bash
# API tests
curl https://brunathens.pages.dev/api/products

# Admin login
curl -X POST https://brunathens.pages.dev/api/admin/login \
  -H "Content-Type: application/json" \
  -d '{"key":"ο-κωδικός"}'
```

## Project Structure

Δες [ARCHITECTURE.md](ARCHITECTURE.md) για αναλυτικό διάγραμμα και data model.
