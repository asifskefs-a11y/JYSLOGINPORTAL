/**
 * VISITOR / CONTRACTOR FUNCTIONS (Phase 2)
 * ---------------------------------------------------------------
 * Visitors are anonymous, so they must NEVER touch the database directly.
 * Everything goes through these functions, which:
 *   - validate input, rate-limit per anonymous session
 *   - allocate the daily token atomically
 *   - upload the signature to Drive from the SERVER (the Drive URL is no
 *     longer exposed to the public)
 *   - use SERVER time (device clocks can be wrong / edited)
 *   - never return PINs or signature links to someone who only typed a mobile
 */
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const crypto = require('crypto');

const db = () => admin.database();
const NODES = { visitor: 'visitors', contractor: 'contractors' };
const PREFIX = { visitor: 'JYSV', contractor: 'JYSC' };
const TZ = 'Asia/Dubai';
const MAX_SIG_BYTES = 1.5 * 1024 * 1024;

/* ------------------------------ helpers ------------------------------ */
const modeOf = (m) => {
  const mode = String(m || 'visitor').toLowerCase().includes('contractor') ? 'contractor' : 'visitor';
  return mode;
};

/** 0501234567 / +971501234567 / 00971501234567 -> 501234567 */
function normMobile(raw) {
  let d = String(raw || '').replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('971') && d.length >= 12) d = d.slice(3);
  if (d.startsWith('0')) d = d.slice(1);
  return d;
}

const dubaiISODate = (ts) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(ts); // YYYY-MM-DD
const dubaiUSDate = (ts) => new Intl.DateTimeFormat('en-US', { timeZone: TZ }).format(ts);   // M/D/YYYY (legacy display)
const dubaiTime = (ts) =>
  new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: true }).format(ts);

const clean = (v, max) => String(v === undefined || v === null ? '' : v).replace(/[\u0000-\u001F<>]/g, '').trim().slice(0, max);
const safeKeyPart = (s) => String(s).replace(/[.#$\[\]\/\s]/g, '');

function requireAuth(req) {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Session not ready. Please refresh the page.');
  return req.auth.uid;
}

async function rateLimit(bucket, limit, windowMs) {
  const key = crypto.createHash('sha256').update(bucket).digest('hex').slice(0, 32);
  const res = await db().ref(`rate_limits/${key}`).transaction((cur) => {
    const now = Date.now();
    const c = cur && now - cur.start < windowMs ? cur : { start: now, n: 0 };
    c.n += 1;
    return c;
  });
  if (res.snapshot.val().n > limit) {
    throw new HttpsError('resource-exhausted', 'Too many requests. Please wait a few minutes and try again.');
  }
}

async function findByMobile(node, raw) {
  const norm = normMobile(raw);
  const rawTrim = String(raw || '').trim();
  const snaps = await Promise.all([
    db().ref(node).orderByChild('mobileNorm').equalTo(norm).get(),
    db().ref(node).orderByChild('mobile').equalTo(rawTrim).get()
  ]);
  const map = new Map();
  snaps.forEach((s) => s.forEach((c) => map.set(c.key, { ...c.val(), firebaseKey: c.key })));
  return [...map.values()];
}

/** What a stranger who only knows a mobile number is allowed to see. */
const publicView = (r, mode) => ({
  id: r.id, firebaseKey: r.firebaseKey, tokenNumber: r.tokenNumber, name: r.name,
  company: r.company || '', timeIn: r.timeIn, status: r.status, mode,
  keyCollected: r.keyCollected || 'NO'
});

async function uploadSignature({ base64, mode, id }) {
  const cfgSnap = await db().ref('system/settings/drive').get();
  const cfg = cfgSnap.val();
  if (!cfg || cfg.isConnected !== true || !cfg.webAppUrl) return 'SYNC_DISABLED_BY_ADMIN';

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 25000);
  try {
    const payload = {
      action: 'upload',
      adekPassNumber: id,
      documentType: 'SIGNATURE',
      category: mode === 'contractor' ? 'CONTRACTORS' : 'VISITORS',
      fileName: `SIG_${id}_${Date.now()}.png`,
      base64Data: base64
    };
    if (cfg.secret) payload.secret = cfg.secret; // optional shared secret checked by Apps Script
    const resp = await fetch(cfg.webAppUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
      signal: ctrl.signal
    });
    if (!resp.ok) throw new Error('Drive HTTP ' + resp.status);
    const out = await resp.json();
    if (out.status === 'success' || out.fileUrl) return out.fileUrl;
    throw new Error(out.message || 'Drive rejected upload');
  } finally {
    clearTimeout(timer);
  }
}

/* ============================= LOOKUP ================================= */
exports.visitorLookup = onCall({ cors: true, maxInstances: 20 }, async (req) => {
  const uid = requireAuth(req);
  const mode = modeOf(req.data && req.data.mode);
  const node = NODES[mode];
  const mobile = String((req.data && req.data.mobile) || '');
  if (normMobile(mobile).length < 8) throw new HttpsError('invalid-argument', 'Enter a valid mobile number.');

  await rateLimit(`lookup:${uid}`, 40, 10 * 60 * 1000);

  const records = await findByMobile(node, mobile);
  let active = null;
  let last = null;
  for (const r of records) {
    if (String(r.status || '').toLowerCase() === 'active') {
      if (!active || (r.timestamp || 0) > (active.timestamp || 0)) active = r;
    } else if (!last || (r.timestamp || 0) > (last.timestamp || 0)) {
      last = r;
    }
  }
  return {
    active: active ? publicView(active, mode) : null,
    lastProfile: last ? { name: last.name || last.fullName || '', company: last.company || '', contractorId: last.contractorId || '' } : null
  };
});

/* ============================= CHECK-IN =============================== */
exports.visitorCheckIn = onCall({ cors: true, maxInstances: 20, memory: '512MiB', timeoutSeconds: 60 }, async (req) => {
  const uid = requireAuth(req);
  const d = req.data || {};
  const mode = modeOf(d.mode);
  const node = NODES[mode];

  const name = clean(d.name, 100);
  const mobile = clean(d.mobile, 25);
  const mobileNorm = normMobile(mobile);
  if (!name || mobileNorm.length < 8) throw new HttpsError('invalid-argument', 'Name and a valid mobile number are required.');

  const sig = String(d.signature || '');
  const m = sig.match(/^data:image\/(png|jpeg);base64,([A-Za-z0-9+/=]+)$/);
  if (!m) throw new HttpsError('invalid-argument', 'Please provide your signature.');
  if (Buffer.byteLength(m[2], 'base64') > MAX_SIG_BYTES) throw new HttpsError('invalid-argument', 'Signature image is too large.');

  await rateLimit(`checkin:${uid}`, 6, 60 * 60 * 1000);

  // Already inside? -> do not create a second active record
  const existing = (await findByMobile(node, mobile)).find((r) => String(r.status || '').toLowerCase() === 'active');
  if (existing) return { alreadyActive: true, record: publicView(existing, mode) };

  const now = Date.now();
  const dateISO = dubaiISODate(now);

  // Atomic daily sequence
  const tx = await db().ref(`counters/${node}/${dateISO}`).transaction((cur) => (cur || 0) + 1);
  if (!tx.committed) throw new HttpsError('aborted', 'Server busy. Please try again.');
  const seq = tx.snapshot.val();
  const id = `${PREFIX[mode]}${String(seq).padStart(3, '0')}`;
  // ✅ Unique per day: the old key `JYSV001` was overwritten every morning.
  const firebaseKey = `${dateISO}_${id}`;

  let signatureUrl;
  try {
    signatureUrl = await uploadSignature({ base64: m[2], mode, id });
  } catch (e) {
    console.error('Drive upload failed:', e.message);
    throw new HttpsError('unavailable', 'Signature could not be saved to cloud storage. Please try again or contact reception.');
  }

  const pin = String(crypto.randomInt(1000, 10000));
  const record = {
    id, tokenId: id, tokenNumber: seq, sequenceNo: seq,
    name, mobile, mobileNorm,
    company: clean(d.company, 100),
    purpose: clean(d.purpose, 300),
    contractorId: clean(d.contractorId, 50),
    keyCollected: d.keyCollected === 'YES' ? 'YES' : 'NO',
    checkoutPin: pin, keyReturnPin: pin,
    date: dubaiUSDate(now), dateISO,
    timeIn: dubaiTime(now),
    timestamp: now,
    status: 'active',
    signatureUrl,
    type: mode
  };

  await db().ref(`${node}/${firebaseKey}`).set(record);

  if (record.keyCollected === 'YES') {
    await db().ref(`security_key_control/${safeKeyPart(mobile) || id}`).set({
      name, id, firebaseKey, type: mode.toUpperCase(), pin, status: 'HELD', timestamp: now
    });
  }
  return { alreadyActive: false, record: { ...record, firebaseKey, mode } };
});

/* ============================= CHECK-OUT ============================== */
exports.visitorCheckOut = onCall({ cors: true, maxInstances: 20 }, async (req) => {
  const uid = requireAuth(req);
  const d = req.data || {};
  const mode = modeOf(d.mode);
  const node = NODES[mode];
  const mobile = String(d.mobile || '');
  if (normMobile(mobile).length < 8) throw new HttpsError('invalid-argument', 'Invalid mobile number.');

  await rateLimit(`checkout:${uid}:${normMobile(mobile)}`, 8, 10 * 60 * 1000);

  const active = (await findByMobile(node, mobile))
    .filter((r) => String(r.status || '').toLowerCase() === 'active')
    .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))[0];
  if (!active) throw new HttpsError('not-found', 'No active check-in found for this number.');

  // If a key is being held, the visitor must prove who they are with the PIN.
  const keyId = safeKeyPart(active.mobile) || active.id;
  const keySnap = await db().ref(`security_key_control/${keyId}`).get();
  const keyHeld = keySnap.exists() && keySnap.val().status === 'HELD';
  if (keyHeld) {
    const pin = String(d.pin || '');
    if (!pin) throw new HttpsError('failed-precondition', 'PIN_REQUIRED');
    if (pin !== String(active.checkoutPin)) throw new HttpsError('permission-denied', 'Wrong PIN. Return the key to security.');
  }

  const now = Date.now();
  await db().ref(`${node}/${active.firebaseKey}`).update({
    outTime: dubaiTime(now),
    status: 'SIGNED OUT',            // same value security + admin tables use (was 'completed' => shown as "open")
    keyReturned: keyHeld ? 'YES' : 'NO',
    timestamp_out: admin.database.ServerValue.TIMESTAMP
  });
  if (keySnap.exists()) await db().ref(`security_key_control/${keyId}`).remove();
  return { ok: true };
});
