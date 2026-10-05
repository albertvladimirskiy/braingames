// Anonymous device tokens: token = "<deviceId>.<HMAC-SHA256(secret, deviceId)>". No accounts, no emails.
import { createHmac, timingSafeEqual, randomUUID } from 'node:crypto';

const sign = (secret, id) => createHmac('sha256', secret).update(id).digest('base64url');

export function issueToken(secret) {
  const deviceId = randomUUID();
  return { deviceId, token: `${deviceId}.${sign(secret, deviceId)}` };
}

/** Returns the deviceId for a valid `Authorization: Bearer …` header, else null. */
export function verifyAuth(secret, header) {
  const m = /^Bearer ([0-9a-f-]{36})\.([A-Za-z0-9_-]{43})$/.exec(header ?? '');
  if (!m) return null;
  const want = Buffer.from(sign(secret, m[1]));
  const got = Buffer.from(m[2]);
  return want.length === got.length && timingSafeEqual(want, got) ? m[1] : null;
}
