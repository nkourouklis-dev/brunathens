# BRUN — Κάρτα επιβράβευσης

Η εφαρμογή δεν παίρνει πια παραγγελίες. Είναι ψηφιακή κάρτα πόντων:

- **Πελάτης (`/`)**: φτιάχνει κάρτα με όνομα + email, βλέπει πόντους, QR και ιστορικό, βάζει την κάρτα στο Apple/Google Wallet. Σε άλλο κινητό μπαίνει με 6ψήφιο κωδικό στο email.
- **Ταμείο (`/admin`)**: ο υπάλληλος μπαίνει με προσωπικό PIN και ο ιδιοκτήτης με τον `ADMIN_ACCESS_KEY`. Σκανάρει το QR (ή πληκτρολογεί τον αριθμό κάρτας), δίνει πόντους, εξαργυρώνει δώρα και αναιρεί λάθη.
- **Ιδιοκτήτης**: βλέπει μέλη και στατιστικά, κάνει διορθώσεις πόντων, ορίζει τους κανόνες (π.χ. 10 πόντοι = δωρεάν καφές) και διαχειρίζεται τους υπαλλήλους.

Η παραγγελία είναι κλειστή: το `POST /api/orders` απαντά `410`. Ξανανοίγει με τη μεταβλητή `ORDERING_ENABLED=1`. Το `src/App.jsx` (παλιό UI παραγγελιών) δεν φορτώνεται πια και μπορεί να διαγραφεί.

---

## 1. Ενεργοποίηση (υποχρεωτικά βήματα)

### 1.1 Βάση δεδομένων

```bash
cd frontend
npx wrangler d1 execute cafe-orders-db --remote --file ../worker/migrations/0013_loyalty.sql
```

Το migration φτιάχνει μόνο νέους πίνακες (`loyalty_*`) και δεν πειράζει τους υπάρχοντες.

### 1.2 Μυστικό κλειδί καρτών

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
npx wrangler pages secret put LOYALTY_SECRET --project-name=brunathens
```

> ⚠️ **Μην το αλλάξεις ποτέ μετά το λανσάρισμα.** Με αυτό υπογράφονται τα QR των Wallet και τα PIN των υπαλλήλους. Αν αλλάξει, τα QR στο Wallet παύουν να ισχύουν και τα PIN πρέπει να ξαναοριστούν.
> Αν λείπει, η εφαρμογή χρησιμοποιεί προσωρινά κλειδί από το `ADMIN_ACCESS_KEY`. Αυτό δουλεύει, αλλά τότε μια αλλαγή κωδικού admin σπάει τα QR.

### 1.3 Email σύνδεσης (Resend)

Χρειάζεται για να βρίσκει ο πελάτης την κάρτα του σε άλλο κινητό. Η εγγραφή και η κάρτα δουλεύουν και χωρίς αυτό.

1. Λογαριασμός στο [resend.com](https://resend.com) → **Domains** → πρόσθεσε ένα domain σου (π.χ. `brunathens.gr`) και βάλε τις εγγραφές DNS που σου δίνει. Χωρίς δικό σου domain, το Resend στέλνει μόνο στο δικό σου email.
2. **API Keys** → νέο κλειδί.
3. ```bash
   npx wrangler pages secret put RESEND_API_KEY --project-name=brunathens
   npx wrangler pages secret put LOYALTY_EMAIL_FROM --project-name=brunathens   # π.χ. BRUN <karta@brunathens.gr>
   ```

### 1.4 Deploy

`git push`. Τα secrets εφαρμόζονται μόνο σε νέο deployment.

### 1.5 Πρώτη χρήση

1. Άνοιξε το `/admin` → **Ιδιοκτήτης** → κωδικός διαχείρισης.
2. **Ρυθμίσεις** → έλεγξε τους κανόνες και πρόσθεσε υπαλλήλους (όνομα + 6ψήφιο PIN, διαφορετικό για τον καθένα).
3. Στο κινητό/tablet του ταμείου: άνοιξε το `/admin` → Κοινοποίηση → «Προσθήκη στην αρχική οθόνη» → μπες με PIN.
4. **Συμπλήρωσε τα στοιχεία της επιχείρησης** στο `frontend/src/loyalty/PrivacyPolicy.jsx` (τα πεδία σε [αγκύλες]) και δώσε το κείμενο να το δει ο λογιστής ή ο νομικός σύμβουλος.

---

## 2. Apple Wallet (προαιρετικό)

Χρειάζεται συνδρομή στο Apple Developer Program (99 $/χρόνο).

1. [developer.apple.com](https://developer.apple.com/account) → **Certificates, Identifiers & Profiles** → **Identifiers** → `+` → **Pass Type IDs** → π.χ. `pass.gr.brunathens.loyalty`.
2. Φτιάξε CSR και κλειδί (στον υπολογιστή σου, με Git Bash ή WSL):
   ```bash
   openssl req -new -newkey rsa:2048 -nodes -keyout pass-key.pem -out pass.csr -subj "/CN=BRUN Pass/C=GR"
   ```
3. Στο Pass Type ID → **Create Certificate** → ανέβασε το `pass.csr` → κατέβασε το `pass.cer`.
   ```bash
   openssl x509 -inform DER -in pass.cer -out pass-cert.pem
   ```
4. Κατέβασε το **Worldwide Developer Relations - G4** από το [apple.com/certificateauthority](https://www.apple.com/certificateauthority/):
   ```bash
   openssl x509 -inform DER -in AppleWWDRCAG4.cer -out wwdr.pem
   ```
5. Το **Team ID** είναι στο Membership details.
6. Secrets:
   ```bash
   npx wrangler pages secret put APPLE_PASS_TYPE_ID  --project-name=brunathens   # pass.gr.brunathens.loyalty
   npx wrangler pages secret put APPLE_TEAM_ID       --project-name=brunathens
   npx wrangler pages secret put APPLE_PASS_CERT_PEM --project-name=brunathens < pass-cert.pem
   npx wrangler pages secret put APPLE_PASS_KEY_PEM  --project-name=brunathens < pass-key.pem
   npx wrangler pages secret put APPLE_WWDR_CERT_PEM --project-name=brunathens < wwdr.pem
   ```
   Κράτα τα `pass-key.pem` / `pass-cert.pem` **εκτός git**.

**Ενημέρωση πόντων στο iPhone.** Η κάρτα στο Wallet έχει web service: ο πελάτης σέρνει προς τα κάτω την πίσω όψη της κάρτας και κατεβαίνουν οι τρέχοντες πόντοι. Για αυτόματη ενημέρωση με ειδοποίηση («Οι πόντοι σου: 7/10») πρόσθεσε κλειδί APNs:

- **Keys** → `+` → **Apple Push Notifications service (APNs)** → κατέβασε το `.p8`.
- ```bash
  npx wrangler pages secret put APPLE_APNS_KEY_P8 --project-name=brunathens < AuthKey_XXXX.p8
  npx wrangler pages secret put APPLE_APNS_KEY_ID --project-name=brunathens
  ```

> ⚠️ Το αυτόματο push δεν έχει δοκιμαστεί ακόμα σε πραγματικό iPhone. Η Apple τεκμηριώνει τα push των passes με το πιστοποιητικό του Pass Type ID, ενώ εδώ χρησιμοποιείται κλειδί `.p8` (token). Αν τα Functions logs γράφουν `apns_failed`, οι πόντοι ενημερώνονται κανονικά με το σύρσιμο προς τα κάτω.

---

## 3. Google Wallet (προαιρετικό, δωρεάν)

1. [pay.google.com/business/console](https://pay.google.com/business/console) → **Google Wallet API** → σημείωσε το **Issuer ID**.
2. [console.cloud.google.com](https://console.cloud.google.com) → νέο project → ενεργοποίησε το **Google Wallet API** → **IAM → Service accounts** → νέο service account → **Keys → Add key → JSON**.
3. Στο Wallet console → **Users** → πρόσθεσε το email του service account ως **Developer**.
4. Secrets (από το JSON: `client_email` και `private_key`):
   ```bash
   npx wrangler pages secret put GOOGLE_WALLET_ISSUER_ID --project-name=brunathens
   npx wrangler pages secret put GOOGLE_WALLET_SA_EMAIL  --project-name=brunathens
   npx wrangler pages secret put GOOGLE_WALLET_SA_KEY    --project-name=brunathens   # επικόλλησε όλο το private_key
   ```
5. Μέχρι να ζητήσεις **Publishing access** στο Wallet console, την κάρτα μπορούν να την αποθηκεύσουν μόνο οι λογαριασμοί δοκιμής που έχεις δηλώσει εκεί.

Σε κάθε αλλαγή πόντων η κάρτα στο Google Wallet ενημερώνεται αυτόματα.

---

## 4. Τοπική ανάπτυξη

Στο `frontend/.dev.vars` πρόσθεσε:

```
LOYALTY_SECRET=οτιδήποτε-για-τοπικά
LOYALTY_DEV_CODES=1
```

Με `LOYALTY_DEV_CODES=1` ο κωδικός σύνδεσης εμφανίζεται στην οθόνη αντί να σταλεί email. **Ποτέ σε production.**

```bash
cd frontend
npx wrangler d1 execute cafe-orders-db --local --file ../worker/migrations/0013_loyalty.sql
npm run build && npx wrangler pages dev dist
```

Η κάμερα στο `/admin` θέλει HTTPS. Τοπικά δουλεύει μόνο στο `localhost`. Για δοκιμή από κινητό, κάνε deploy (ή χρησιμοποίησε το «Ή γράψε τον αριθμό κάρτας»).

---

## 5. Πώς δουλεύει (τεχνικά)

| Θέμα | Υλοποίηση |
|---|---|
| Λογαριασμός πελάτη | Cookie `brun_loyalty` (HttpOnly, 1 έτος). Η βάση κρατά μόνο το SHA-256 του. |
| Σύνδεση σε νέα συσκευή | 6ψήφιος κωδικός στο email: 15 λεπτά, μίας χρήσης, το πολύ 5 λάθος προσπάθειες, όριο 5 email/ώρα. |
| QR στην εφαρμογή | `BRUN:R:…`, υπογεγραμμένο (HMAC), λήγει σε 2 λεπτά και ανανεώνεται μόνο του. Ένα screenshot δεν δουλεύει αργότερα. |
| QR στο Wallet | `BRUN:S:…`, σταθερό και υπογεγραμμένο. Ακυρώνεται με τη διαγραφή του λογαριασμού. |
| Αριθμός κάρτας | 8 χαρακτήρες χωρίς 0/O/1/I/L, για να πληκτρολογείται χωρίς λάθη. |
| Σάρωση | Το lookup δίνει «εισιτήριο» 5 λεπτών. Με κάθε εισιτήριο μπαίνουν πόντοι **μία** φορά. Δεύτερη σάρωση μέσα σε 60″ ζητά επιβεβαίωση. |
| Πόντοι | Ledger (`loyalty_transactions`): κάθε κίνηση είναι μία γραμμή, με υπάλληλο και ώρα. Κάθε αλλαγή γίνεται σε ένα D1 batch (transaction). Το `CHECK (points >= 0)` δεν αφήνει αρνητικό υπόλοιπο. |
| Αναίρεση | Ο υπάλληλος αναιρεί μέσα σε 15 λεπτά, ο ιδιοκτήτης πάντα. Γράφεται αντίστροφη κίνηση, δεν σβήνεται τίποτα. |
| PIN υπαλλήλου | Αποθηκεύεται ως HMAC (όχι το ίδιο το PIN). Όριο 10 προσπάθειες / 15′ ανά IP. Η απενεργοποίηση αποσυνδέει αμέσως. |
| Υπάλληλος vs ιδιοκτήτης | Το token του υπαλλήλου δεν ανοίγει endpoints ιδιοκτήτη (μέλη, διορθώσεις, ρυθμίσεις, παραγγελίες). |
| Διαγραφή λογαριασμού | Όνομα/email σβήνονται, sessions και Wallet registrations διαγράφονται, το QR ακυρώνεται. Το ανώνυμο ιστορικό μένει για τα στατιστικά. |

### Endpoints

| Method | Path | Ποιος |
|---|---|---|
| GET | `/api/loyalty/config` | δημόσιο |
| POST | `/api/loyalty/signup` | δημόσιο |
| POST | `/api/loyalty/login/request`, `/login/verify` | δημόσιο |
| POST | `/api/loyalty/logout` | πελάτης |
| GET / PATCH / DELETE | `/api/loyalty/me` | πελάτης |
| GET | `/api/loyalty/qr` | πελάτης |
| GET | `/api/loyalty/wallet/apple`, `/wallet/google` | πελάτης |
| * | `/api/loyalty/wallet/apple-ws/v1/…` | Apple Wallet (web service) |
| POST | `/api/loyalty/staff/login` | υπάλληλος (PIN) |
| GET | `/api/loyalty/admin/me`, `/admin/activity` | υπάλληλος / ιδιοκτήτης |
| POST | `/api/loyalty/admin/lookup`, `/earn`, `/redeem`, `/undo` | υπάλληλος / ιδιοκτήτης |
| GET | `/api/loyalty/admin/members`, `/admin/stats` | ιδιοκτήτης |
| POST | `/api/loyalty/admin/adjust` | ιδιοκτήτης |
| GET / PUT | `/api/loyalty/admin/settings` | ιδιοκτήτης |
| GET / POST | `/api/loyalty/admin/staff`, PATCH `/admin/staff/:id` | ιδιοκτήτης |

### Secrets / μεταβλητές

| Όνομα | Υποχρεωτικό | Σκοπός |
|---|---|---|
| `LOYALTY_SECRET` | ναι (βλ. 1.2) | Υπογραφές QR, PIN, Wallet |
| `RESEND_API_KEY`, `LOYALTY_EMAIL_FROM` | για σύνδεση σε νέα συσκευή | Email κωδικών |
| `APPLE_PASS_TYPE_ID`, `APPLE_TEAM_ID`, `APPLE_PASS_CERT_PEM`, `APPLE_PASS_KEY_PEM`, `APPLE_WWDR_CERT_PEM` | για Apple Wallet | Υπογραφή .pkpass |
| `APPLE_APNS_KEY_P8`, `APPLE_APNS_KEY_ID` | προαιρετικό | Αυτόματη ενημέρωση iPhone |
| `GOOGLE_WALLET_ISSUER_ID`, `GOOGLE_WALLET_SA_EMAIL`, `GOOGLE_WALLET_SA_KEY` | για Google Wallet | Κάρτα + ενημέρωση πόντων |
| `LOYALTY_DEV_CODES` | μόνο τοπικά | Κωδικός σύνδεσης στην οθόνη |
| `ORDERING_ENABLED` | όχι | `1` = ξανανοίγει τις παραγγελίες |

Τα κουμπιά Wallet εμφανίζονται στον πελάτη **μόνο** όταν έχουν οριστεί τα αντίστοιχα secrets.

---

## 6. Συχνές περιπτώσεις στο ταμείο

- **Ξέχασε το κινητό:** ο ιδιοκτήτης ανοίγει **Μέλη** → αναζήτηση με όνομα → **Διόρθωση πόντων** +1. Ή ο πελάτης λέει τον αριθμό κάρτας του.
- **Μπήκε πόντος κατά λάθος:** πάτα «Αναίρεση» στην κάρτα του πελάτη, ή στις **Κινήσεις**.
- **«Ο κωδικός QR έληξε»:** ο πελάτης άνοιξε την κάρτα πολλή ώρα χωρίς ίντερνετ. Ας την ανανεώσει, ή σκάναρε από το Wallet, ή πληκτρολόγησε τον αριθμό κάρτας.
- **Υπάλληλος έφυγε από τη δουλειά:** **Ρυθμίσεις** → «Απενεργοποίηση». Αποσυνδέεται αμέσως.
