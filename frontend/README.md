# BRUN — Coffee Ordering PWA

PWA για παραγγελίες καφέ με React + Cloudflare Pages Functions + D1.

**Live:** https://brunathens.pages.dev

## Documentation

| Θέμα | Αρχείο |
|---|---|
| Αρχιτεκτονική & διαγράμματα | [docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md) |
| Οδηγός χρήσης (πελάτης + admin) | [docs/USER_MANUAL.md](../docs/USER_MANUAL.md) |
| Setup & development | [docs/DEVELOPMENT.md](../docs/DEVELOPMENT.md) |
| Operations & troubleshooting | [docs/OPERATIONS.md](../docs/OPERATIONS.md) |

## Quick Start

```bash
cd frontend
npm install
npm run build
npx wrangler pages dev dist
```

## Deploy

```bash
git push  # auto-deploy στο Cloudflare Pages
```

## Tech

React 19 · Vite 8 · Cloudflare Pages Functions · D1 (SQLite) · Web Push (VAPID)
