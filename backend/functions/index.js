/**
 * SCHOOLLOG - CLOUD FUNCTIONS (Phase 1: Secure Authentication)
 * ---------------------------------------------------------------
 * staffLogin       -> verifies ADEK/ID + password ON THE SERVER, returns a
 *                     Firebase custom token carrying role claims.
 * setStaffPassword -> ADMIN ONLY. Sets/resets a staff password (hashed).
 *
 * Passwords are NEVER stored in the public `staff` node any more.
 * Hashes live in `staff_secrets/{staffKey}` which no client can read/write
 * (see database.rules.stage1.json). Only this code (Admin SDK) can.
 */
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const crypto = require('crypto');

admin.initializeApp();
const db = admin.database();

// Phase 2: visitor / contractor callable functions
Object.assign(exports, require('./visitors'));

const MAX_FAILS = 5;                 // wrong attempts before lockout
const LOCK_MS = 15 * 60 * 1000;      // 15 minutes
const MIN_PASSWORD_LEN = 8;

/* ------------------------- password hashing ------------------------- */
function hashPassword(plain) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(plain, salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

function checkHash(plain, stored) {
  try {
    const [algo, salt, hash] = String(stored).split('$');
    if (algo !== 'scrypt' || !salt || !hash) return false;
    const test = crypto.scryptSync(plain, salt, 64);
    const real = Buffer.from(hash, 'hex');
    return real.length === test.length && crypto.timingSafeEqual(real, test);
  } catch (_) {
    return false;
  }
}

// Constant-time compare for the one-time legacy plain-text migration.
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/* --------------------------- rate limiting -------------------------- */
const attemptKey = (id) =>
  crypto.createHash('sha256').update(id.toLowerCase()).digest('hex').slice(0, 32);

async function assertNotLocked(id) {
  const snap = await db.ref(`login_attempts/${attemptKey(id)}`).get();
  const v = snap.val();
  if (v && v.lockedUntil && v.lockedUntil > Date.now()) {
    const mins = Math.ceil((v.lockedUntil - Date.now()) / 60000);
    throw new HttpsError('resource-exhausted',
      `Too many failed attempts. Try again in ${mins} minute(s).`);
  }
}

async function registerFailure(id) {
  await db.ref(`login_attempts/${attemptKey(id)}`).transaction((cur) => {
    const now = Date.now();
    const c = cur && now - (cur.first || 0) < LOCK_MS ? cur : { count: 0, first: now };
    c.count = (c.count || 0) + 1;
    if (c.count >= MAX_FAILS) c.lockedUntil = now + LOCK_MS;
    return c;
  });
}

const clearFailures = (id) => db.ref(`login_attempts/${attemptKey(id)}`).remove();

/* ------------------------------ helpers ----------------------------- */
async function findStaff(id) {
  const snap = await db.ref('staff').get();
  if (!snap.exists()) return null;
  const needle = id.toLowerCase().trim();
  const all = snap.val();
  for (const [key, u] of Object.entries(all)) {
    if (!u || typeof u !== 'object') continue;
    const ids = [u.adekPass, u.adcPassNumber, u.username, u.mobile]
      .filter((x) => x !== undefined && x !== null)
      .map((x) => String(x).toLowerCase().trim());
    if (ids.includes(needle)) return { key, record: u };
  }
  return null;
}

async function verifyPassword(key, record, plain) {
  const sec = await db.ref(`staff_secrets/${key}`).get();
  if (sec.exists()) return checkHash(plain, sec.val().hash);

  // One-time lazy migration of a legacy plain-text password.
  if (record.password !== undefined && record.password !== null && record.password !== '') {
    if (!safeEqual(record.password, plain)) return false;
    await db.ref(`staff_secrets/${key}`).set({ hash: hashPassword(plain), updatedAt: Date.now() });
    await db.ref(`staff/${key}/password`).remove();
    return true;
  }
  return false;
}

/* ---------------------------- staffLogin ---------------------------- */
exports.staffLogin = onCall({ cors: true, maxInstances: 20 }, async (req) => {
  const id = String((req.data && req.data.id) || '').trim();
  const password = String((req.data && req.data.password) || '');
  if (!id || !password || id.length > 100 || password.length > 200) {
    throw new HttpsError('invalid-argument', 'ID and password are required.');
  }

  await assertNotLocked(id);

  const found = await findStaff(id);
  // Same error for "unknown user" and "wrong password" (no user enumeration).
  if (!found || !(await verifyPassword(found.key, found.record, password))) {
    await registerFailure(id);
    throw new HttpsError('unauthenticated', 'Invalid ID or password.');
  }
  await clearFailures(id);

  const { key, record } = found;
  if (record.isLocked === true) {
    throw new HttpsError('permission-denied', 'Account is locked. Contact administrator.');
  }

  const role = String(record.role || '').toLowerCase().trim();
  const claims = {
    role,
    admin: role === 'admin',
    staffKey: key,
    mobile: record.mobile ? String(record.mobile) : ''
  };
  const token = await admin.auth().createCustomToken(`staff_${key}`, claims);

  const profile = { ...record, firebaseKey: key };
  delete profile.password;                 // never send secrets to the client
  return { token, profile };
});

/* ------------------------- setStaffPassword ------------------------- */
exports.setStaffPassword = onCall({ cors: true }, async (req) => {
  if (!req.auth || req.auth.token.admin !== true) {
    throw new HttpsError('permission-denied', 'Admin only.');
  }
  const staffKey = String((req.data && req.data.staffKey) || '');
  const password = String((req.data && req.data.password) || '');
  if (!/^[A-Za-z0-9_\-]{1,100}$/.test(staffKey)) {
    throw new HttpsError('invalid-argument', 'Invalid staff key.');
  }
  if (password.length < MIN_PASSWORD_LEN) {
    throw new HttpsError('invalid-argument', `Password must be at least ${MIN_PASSWORD_LEN} characters.`);
  }
  const exists = await db.ref(`staff/${staffKey}`).get();
  if (!exists.exists()) throw new HttpsError('not-found', 'Staff record not found.');

  await db.ref(`staff_secrets/${staffKey}`).set({ hash: hashPassword(password), updatedAt: Date.now() });
  await db.ref(`staff/${staffKey}/password`).remove();
  return { ok: true };
});

/* -------------------------- verifyMyPassword ------------------------- */
/** Re-verifies the CURRENT signed-in staff member's password (check-in/out). */
exports.verifyMyPassword = onCall({ cors: true }, async (req) => {
  const key = req.auth && req.auth.token && req.auth.token.staffKey;
  if (!key) throw new HttpsError('unauthenticated', 'Please log in again.');
  const password = String((req.data && req.data.password) || '');
  if (!password || password.length > 200) throw new HttpsError('invalid-argument', 'Password required.');

  const lockId = `pw:${key}`;
  await assertNotLocked(lockId);
  const snap = await db.ref(`staff/${key}`).get();
  if (!snap.exists()) throw new HttpsError('not-found', 'Staff record not found.');

  const ok = await verifyPassword(key, snap.val(), password);
  if (!ok) { await registerFailure(lockId); return { ok: false }; }
  await clearFailures(lockId);
  return { ok: true };
});
