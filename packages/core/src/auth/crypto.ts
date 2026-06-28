import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { config } from '../config.js';

// Symmetric encryption for secrets stored at rest (e.g. a user's own LLM API
// key). AES-256-GCM with a server master key from ENCRYPTION_KEY. The stored
// form is `iv:authTag:ciphertext`, each part base64url.

/** 32-byte key derived from ENCRYPTION_KEY (accepts any length; hashed to 256 bits). */
function key(): Buffer {
  if (!config.encryptionKey) {
    throw new Error('ENCRYPTION_KEY is not configured (required to store secrets)');
  }
  return createHash('sha256').update(config.encryptionKey).digest();
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString('base64url'), tag.toString('base64url'), ct.toString('base64url')].join(':');
}

export function decryptSecret(enc: string): string {
  const [ivB64, tagB64, ctB64] = enc.split(':');
  if (!ivB64 || !tagB64 || !ctB64) throw new Error('malformed encrypted secret');
  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(ivB64, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(ctB64, 'base64url')), decipher.final()]).toString('utf8');
}
