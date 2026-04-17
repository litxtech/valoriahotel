import crypto from 'node:crypto';

const ALGO = 'aes-256-gcm';

function keyFromSecret(secret: string): Buffer {
  return crypto.createHash('sha256').update(secret, 'utf8').digest();
}

export function decrypt(value: string, secret: string): string {
  const [v, ivB64, tagB64, dataB64] = value.split(':');
  if (v !== 'v1' || !ivB64 || !tagB64 || !dataB64) throw new Error('Invalid encrypted format');
  const key = keyFromSecret(secret);
  const iv = Buffer.from(ivB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const data = Buffer.from(dataB64, 'base64');
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(data), decipher.final()]);
  return plaintext.toString('utf8');
}

