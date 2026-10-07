# SchoolLog – FRESH COMPLETE PACKAGE (v9.1)

Sab kuch isme hai. Purani files se merge karne ki zarurat NAHI – is package ko as-is use karo.

```
schoollog_fresh/
├─ web/                  ← YE poora folder aapki website / app me upload hoga (HTML, JS, CSS, icons, modules/)
├─ backend/              ← Firebase side (aapke computer se deploy hoga, website pe upload NAHI)
│   ├─ functions/        ← secure login + visitor Cloud Functions
│   ├─ scripts/          ← admin banane / passwords migrate karne ki script
│   ├─ database.rules.json            ← STRICT rules (final)
│   ├─ rules/…FALLBACK-less-strict.json
│   └─ firebase.json
├─ android_resources/    ← Android Studio ke res/ files (network_security_config.xml hardened)
└─ unused_not_loaded/    ← wo files jo koi page load nahi karta (reference ke liye, upload mat karo)
```

## Step-by-step (is order me)

### 0. Backup
Firebase Console → Realtime Database → ⋮ → **Export JSON**. Purane rules ka text bhi kahin copy kar lo.

### 1. Firebase Console
- **Blaze plan** lo (Cloud Functions ke liye; school app me cost ~0).
- Authentication → Get started → Sign-in method → **Anonymous = Enable** (sirf visitor/contractor pages ke liye).

### 2. Functions deploy (apne computer par)
```
npm i -g firebase-tools
firebase login
cd backend
firebase use schoollog-f0a04
cd functions && npm install && cd ..
firebase deploy --only functions
```
Deploy hone ke baad 6 functions banenge: `staffLogin`, `setStaffPassword`, `verifyMyPassword`, `visitorLookup`, `visitorCheckIn`, `visitorCheckOut` (region `us-central1`).

### 3. Admin banao + passwords hash karo
1. Console → Project settings → Service accounts → **Generate new private key** → `backend/scripts/serviceAccount.json` naam se save karo (kisi ko mat do).
2. ```
   cd backend/scripts && npm install
   node migrate.js create-admin <username> "Full Name" <StrongPassword-8+chars>
   node migrate.js migrate
   ```
   `admin / 1234` ab kaam nahi karega. Naya admin yahi hai.
   Staff apne purane password se hi login karenge (ab hash me store). Public rahe hone ki wajah se unhe password badalne bolo.

### 4. Website upload
`web/` folder ka poora content apne hosting me upload karo (purani files overwrite).
Android WebView me assets ke andar ho to `web/` ka content wahin copy karo.
Phones me purana service worker: Chrome → Site settings → Clear data (ek baar).

### 5. TEST (abhi rules purane/khule hain, isliye sab chalna chahiye)
- Admin login (naya ID/password); `admin/1234` FAIL hona chahiye
- Staff login (ADEK + password); 5 galat attempts → 15 min lockout
- Check-in / check-out (password modal), biometric unlock
- Visitor + Contractor check-in/out (`visitor.html`), landing page se "verify mobile" + check-out
- Staff documents upload, admin approve
- Add/Edit staff (password min 8 chars)

### 6. Database LOCK (sirf step 5 pass hone ke baad)
Console → Realtime Database → Rules → `backend/database.rules.json` paste → **Publish**
(ya `cd backend && firebase deploy --only database`). Step 5 ke tests dobara chalao.
Kuch toote to purane rules wapas paste karo (rollback) aur mujhe failing action batao.

### 7. Aur karo
- Google Cloud Console → Credentials → Browser API key ko apne domain(s) tak restrict karo.
- Firebase → App Check (reCAPTCHA) enable karo.
- Google Apps Script (Drive) URL regenerate karo agar kabhi share hua ho.
- Android: `android_resources/network_security_config.xml` apne project me replace karo (HTTPS only).

## Ye files hata di gayi (koi page load nahi karta / duplicate / insecure)
`app.js, auth_module.js, task_module.js, asset_normalizer(.js.js), universal_disposal_js.js, index_-_Copy.html,
staff-ui_-_Copy.css, staff.html (fake localStorage login), schoollog.cpp, CMakeLists.txt, OneSignalSDKWorker.js,
docs_init/docs_sync/docs_drive (sirf purane staff.html me the)`.
Aur ye bhi kisi page me load nahi hoti, to `unused_not_loaded/` me hain:
`universal_disposal.js, csv_schema_validator.js, asset_normalizer.js, csrf_token_manager.js,
firebase_path_manager.js, modal_manager.js, modal_payloads.js, notification_module.js, docs_styles.css`.
(Matlab inke features abhi app me ON nahi hain – Phase 3 me decide karenge ki jodna hai ya nahi.)

## Abhi bhi baaki (Phase 3+)
Responsive/iOS (100vh, safe-area, Tailwind CDN), ~40 complex innerHTML spots, staff-side role-wise Rules,
document-approval se check-in lock (Rules me), scanner ek scan = ek screen ka handler, asli push notifications.
