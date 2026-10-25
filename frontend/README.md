# Kerdiseto

Πλατφόρμα καρτών επιβράβευσης για πολλές επιχειρήσεις. React + Cloudflare Pages Functions + D1.

**Live:** https://kerdiseto.pages.dev

## Έγγραφα

| Θέμα | Αρχείο |
|---|---|
| Οδηγός (διαχειριστής, ιδιοκτήτες, πελάτες) | [docs/KERDISETO_GUIDE.md](../docs/KERDISETO_GUIDE.md) |
| Κάρτα, Wallet, email, ασφάλεια | [docs/LOYALTY.md](../docs/LOYALTY.md) |
| Setup & development | [docs/DEVELOPMENT.md](../docs/DEVELOPMENT.md) |
| Operations & troubleshooting | [docs/OPERATIONS.md](../docs/OPERATIONS.md) |

## Quick start

```bash
cd frontend
npm install
npm run build
npx wrangler pages deploy dist --project-name kerdiseto --branch master
```
