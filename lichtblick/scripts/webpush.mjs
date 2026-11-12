// Web Push without any library: encrypts a message for one phone (RFC 8291, "aes128gcm") and signs
// the request so the phone maker's push service accepts it (VAPID, RFC 8292). Used by the scheduled
// alerts job (scripts/digest.mjs); the phone's part is in sw.js and js/push.js.
import { createECDH, createCipheriv, createPrivateKey, hkdfSync, randomBytes, sign } from 'node:crypto';

export const b64u = (buf) => Buffer.from(buf).toString('base64url');
export const unb64u = (s) => Buffer.from(String(s).replace(/=+$/, ''), 'base64url');

// The encrypted body for a subscription's public key (p256dh) and auth secret. salt and localKey
// are random; tests pass fixed ones to compare with the example in RFC 8291.
export function encrypt(plaintext, p256dh, auth, { salt = randomBytes(16), localKey = null } = {}) {
  const ua = unb64u(p256dh), secret = unb64u(auth);
  if (ua.length !== 65 || ua[0] !== 4) throw new Error('not a P-256 public key');
  const ecdh = createECDH('prime256v1');
  if (localKey) ecdh.setPrivateKey(unb64u(localKey)); else ecdh.generateKeys();
  const as = ecdh.getPublicKey();
  const shared = ecdh.computeSecret(ua);
  const ikm = Buffer.from(hkdfSync('sha256', shared, secret, Buffer.concat([Buffer.from('WebPush: info\0'), ua, as]), 32));
  const cek = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
  const nonce = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12));
  const cipher = createCipheriv('aes-128-gcm', cek, nonce);
  const body = Buffer.concat([cipher.update(Buffer.concat([Buffer.from(plaintext), Buffer.from([2])])), cipher.final(), cipher.getAuthTag()]);
  const header = Buffer.alloc(21); Buffer.from(salt).copy(header, 0); header.writeUInt32BE(4096, 16); header[20] = as.length;
  return Buffer.concat([header, as, body]);
}

// "Authorization: vapid t=..., k=...": a short-lived token signed with the app's own key
export function vapidHeader(endpoint, vapid, subject, now = Date.now()) {
  const pub = unb64u(vapid.publicKey);
  const key = createPrivateKey({ format: 'jwk', key: { kty: 'EC', crv: 'P-256', d: b64u(unb64u(vapid.privateKey)), x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33, 65)) } });
  const head = b64u(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const claims = b64u(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + 12 * 3600, sub: subject }));
  const sig = sign('sha256', Buffer.from(`${head}.${claims}`), { key, dsaEncoding: 'ieee-p1363' });
  return `vapid t=${head}.${claims}.${b64u(sig)}, k=${b64u(pub)}`;
}

// Sends one message. Answers { ok, status, gone }: gone means the phone's subscription has ended
// (the app was removed or its permission withdrawn) and a new setup code is needed.
export async function sendPush(sub, vapid, message, { ttl = 6 * 3600, urgency = 'normal', subject = 'https://github.com/' } = {}) {
  const body = encrypt(typeof message === 'string' ? message : JSON.stringify(message), sub.keys.p256dh, sub.keys.auth);
  const r = await fetch(sub.endpoint, {
    method: 'POST', body,
    headers: { 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', TTL: String(ttl), Urgency: urgency, Authorization: vapidHeader(sub.endpoint, vapid, subject) },
  });
  return { ok: r.status >= 200 && r.status < 300, status: r.status, gone: r.status === 404 || r.status === 410, text: r.ok ? '' : (await r.text().catch(() => '')).slice(0, 200) };
}
