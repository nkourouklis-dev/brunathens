# Kerdiseto — Operations Runbook

## Η εφαρμογή δεν φορτώνει
1. Έλεγξε https://www.cloudflarestatus.com/
2. Cloudflare → Pages → kerdiseto → Deployments: υπάρχει failed deploy;
3. Rollback: πάτα ⋯ σε προηγούμενο επιτυχημένο deployment → **Rollback**

## Το API επιστρέφει 500
1. Pages → kerdiseto → **Functions** → **Logs** → δες το σφάλμα
2. Συνηθέστερα αίτια:
   - Λείπει το D1 binding `DB` (Settings → Functions → D1 database bindings)
   - Λείπει secret (Settings → Environment variables)
   - Λείπει migration → έλεγξε ότι έχουν τρέξει όλα τα αρχεία στο `worker/migrations/`

## Δεν μπαίνω στο /platform
1. Έλεγξε ότι υπάρχει το secret: `npx wrangler pages secret list --project-name kerdiseto`
2. Αν λείπει: `npx wrangler pages secret put ADMIN_ACCESS_KEY --project-name kerdiseto`
3. **Redeploy**: τα secrets εφαρμόζονται μόνο σε νέο deployment.

## Ο ιδιοκτήτης έχασε τον κωδικό
`/platform` → διάλεξε την επιχείρηση → **Νέος κωδικός**.

## Δεν έρχονται email στους πελάτες
Έλεγξε ότι υπάρχουν τα secrets `RESEND_API_KEY` και `LOYALTY_EMAIL_FROM` (βλ. [LOYALTY.md](LOYALTY.md)) και κάνε νέο deploy.

## Χρήσιμα
| Τι | Πού |
|---|---|
| Deployments | Pages → kerdiseto → Deployments |
| Functions logs | Pages → kerdiseto → Functions → Logs |
| Βάση | Storage & databases → D1 → cafe-orders-db |
