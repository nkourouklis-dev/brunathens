# BRUN — Operations Runbook

## Επείγοντα

### Η εφαρμογή δεν φορτώνει
1. Έλεγξε https://www.cloudflarestatus.com/
2. Έλεγξε το [Deployments](https://dash.cloudflare.com) — υπάρχει failed build;
3. Rollback: Pages → brunathens → Deployments → πάτα ⋯ σε προηγούμενο επιτυχημένο → **Rollback**

### Το API επιστρέφει 500
1. Pages → brunathens → **Functions** → **Logs** → δες το σφάλμα
2. Συνηθέστερα αίτια:
   - Λείπει D1 binding (`DB`) → Settings → Functions → D1 bindings
   - Λείπει secret → Settings → Environment variables
   - SQL error → έλεγξε το migration state

### Δεν δουλεύει το admin login
1. Έλεγξε ότι το `ADMIN_ACCESS_KEY` secret είναι ορισμένο:
   ```bash
   npx wrangler pages secret list --project-name=brunathens
   ```
2. Αν λείπει, βάλτο ξανά:
   ```bash
   echo "ο-κωδικός" | npx wrangler pages secret put ADMIN_ACCESS_KEY --project-name=brunathens
   ```
3. **Redeploy** — τα secrets εφαρμόζονται μόνο σε νέο deployment

### Δεν έρχονται push notifications
1. Έλεγξε ότι το `VAPID_PRIVATE_KEY` είναι ορισμένο
2. Έλεγξε ότι το `VAPID_PUBLIC_KEY` στον κώδικα ταιριάζει με το private
3. Ο admin πρέπει να πατήσει ξανά «Ενεργοποίηση ειδοποιήσεων» μετά από αλλαγή keys
4. Έλεγξε Functions logs για `push_delivery_failed` events

## Monitoring

| Τι | Πού |
|---|---|
| Deployments | Pages → brunathens → Deployments |
| Functions logs | Pages → brunathens → Functions → Logs |
| D1 queries | Cloudflare dashboard → D1 → cafe-orders-db → Metrics |
| Errors | Functions logs + browser DevTools console |

## Backup

### Database
```bash
# Export (προσεκτικά — μπορεί να είναι αργό σε μεγάλα δεδομένα)
npx wrangler d1 export cafe-orders-db --output backup.sql
```

### Code
- Το code είναι στο GitHub: https://github.com/nkourouklis-dev/brunathens
- Κάθε commit είναι και backup

## Secrets Rotation

| Secret | Πότε | Πώς |
|---|---|---|
| `ADMIN_ACCESS_KEY` | Κάθε 3–6 μήνες ή αν ύποπτη δραστηριότητα | `wrangler pages secret put` + redeploy |
| `VAPID_PRIVATE_KEY` | Σπάνια — μόνο αν compromised | Νέα keypair + update 2 αρχείων + redeploy + admin re-subscribe |

## Scaling

Το τρέχον setup (Pages + D1 free tier) καλύπτει:
- ~100.000 requests/ημέρα
- ~100GB reads/ημέρα (D1)
- Απεριόριστο static bandwidth (Pages)

Αν χρειαστείς παραπάνω:
- D1 paid plan για περισσότερα reads/writes
- Pages Functions paid plan για περισσότερα invocations

## Contacts

| Ρόλος | Ποιος |
|---|---|
| Developer | [Το όνομά σου] |
| Cloudflare account owner | [Το email σου] |
| GitHub repo owner | nkourouklis-dev |
