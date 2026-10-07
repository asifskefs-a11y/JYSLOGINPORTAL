/**
 * SCHOOLLOG - ONE-TIME ADMIN SCRIPT (runs on YOUR computer, not in the browser)
 *
 *   node migrate.js migrate
 *       Hash every legacy plain-text password into staff_secrets/ and delete
 *       the plain text from staff/. Run this BEFORE locking the database.
 *
 *   node migrate.js create-admin <username> "<Full Name>" <password>
 *       Creates (or promotes) an Admin staff record. Replaces admin/1234.
 *
 *   node migrate.js set-password <username-or-adek-or-mobile> <newPassword>
 *       Reset any staff password.
 *
 * Setup:
 *   1. Firebase Console -> Project settings -> Service accounts ->
 *      "Generate new private key". Save as scripts/serviceAccount.json
 *      (NEVER commit/share this file).
 *   2. cd scripts && npm i firebase-admin
 */
const admin = require('firebase-admin');
const crypto = require('crypto');

admin.initializeApp({
  credential: admin.credential.cert(require('./serviceAccount.json')),
  databaseURL: 'https://schoollog-f0a04-default-rtdb.firebaseio.com'
});
const db = admin.database();

const hashPassword = (plain) => {
  const salt = crypto.randomBytes(16).toString('hex');
  return `scrypt$${salt}$${crypto.scryptSync(plain, salt, 64).toString('hex')}`;
};

async function findKey(id) {
  const snap = await db.ref('staff').get();
  const needle = String(id).toLowerCase().trim();
  for (const [key, u] of Object.entries(snap.val() || {})) {
    if (!u) continue;
    const ids = [u.adekPass, u.adcPassNumber, u.username, u.mobile]
      .filter((x) => x != null).map((x) => String(x).toLowerCase().trim());
    if (ids.includes(needle)) return key;
  }
  return null;
}

async function migrate() {
  const snap = await db.ref('staff').get();
  let done = 0, skipped = 0;
  for (const [key, u] of Object.entries(snap.val() || {})) {
    if (!u || u.password === undefined || u.password === null || u.password === '') { skipped++; continue; }
    await db.ref(`staff_secrets/${key}`).set({ hash: hashPassword(String(u.password)), updatedAt: Date.now() });
    await db.ref(`staff/${key}/password`).remove();
    done++;
  }
  console.log(`Migrated ${done} password(s). Skipped ${skipped} (no plain password).`);
}

async function createAdmin(username, fullName, password) {
  if (!username || !fullName || !password || password.length < 8) {
    throw new Error('Usage: create-admin <username> "<Full Name>" <password (min 8 chars)>');
  }
  let key = await findKey(username);
  if (!key) key = db.ref('staff').push().key;
  await db.ref(`staff/${key}`).update({
    username, adekPass: username, fullName, name: fullName,
    role: 'Admin', updatedAt: Date.now()
  });
  await db.ref(`staff_secrets/${key}`).set({ hash: hashPassword(password), updatedAt: Date.now() });
  await db.ref(`staff/${key}/password`).remove();
  console.log(`Admin ready. Login ID: ${username}  (staff key: ${key})`);
}

async function setPassword(id, password) {
  if (!id || !password || password.length < 8) throw new Error('Usage: set-password <id> <password (min 8 chars)>');
  const key = await findKey(id);
  if (!key) throw new Error('Staff not found: ' + id);
  await db.ref(`staff_secrets/${key}`).set({ hash: hashPassword(password), updatedAt: Date.now() });
  await db.ref(`staff/${key}/password`).remove();
  console.log('Password updated for', id);
}

(async () => {
  const [cmd, a, b, c] = process.argv.slice(2);
  if (cmd === 'migrate') await migrate();
  else if (cmd === 'create-admin') await createAdmin(a, b, c);
  else if (cmd === 'set-password') await setPassword(a, b);
  else console.log('Commands: migrate | create-admin | set-password (see header)');
  process.exit(0);
})().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
