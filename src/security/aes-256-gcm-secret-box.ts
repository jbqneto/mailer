import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import type { EncryptedSecret, SecretBox } from './secret-box.js';

const ALGORITHM = 'aes-256-gcm' as const;
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32;

export class Aes256GcmSecretBox implements SecretBox {
  constructor(
    private readonly key: Buffer,
    private readonly keyVersion = 1,
  ) {
    if (key.length !== KEY_LENGTH) {
      throw new Error('AES-256-GCM secret key must be exactly 32 bytes');
    }
  }

  encrypt(value: string): EncryptedSecret {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, this.key, iv, { authTagLength: AUTH_TAG_LENGTH });
    const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);

    return {
      version: 1,
      keyVersion: this.keyVersion,
      algorithm: ALGORITHM,
      iv: iv.toString('base64url'),
      authTag: cipher.getAuthTag().toString('base64url'),
      ciphertext: ciphertext.toString('base64url'),
    };
  }

  decrypt(secret: EncryptedSecret): string {
    if (secret.version !== 1 || secret.algorithm !== ALGORITHM) {
      throw new Error('Unsupported encrypted secret format');
    }
    if (secret.keyVersion !== this.keyVersion) {
      throw new Error(`Encrypted secret requires key version ${secret.keyVersion}`);
    }

    const iv = Buffer.from(secret.iv, 'base64url');
    const authTag = Buffer.from(secret.authTag, 'base64url');
    const ciphertext = Buffer.from(secret.ciphertext, 'base64url');

    if (iv.length !== IV_LENGTH || authTag.length !== AUTH_TAG_LENGTH) {
      throw new Error('Invalid encrypted secret payload');
    }

    const decipher = createDecipheriv(ALGORITHM, this.key, iv, { authTagLength: AUTH_TAG_LENGTH });
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  }
}

export function parseSecretKey(value: string): Buffer {
  const trimmed = value.trim();
  if (!trimmed) throw new Error('Secret key cannot be empty');

  const key = Buffer.from(trimmed, 'base64url');
  if (key.length !== KEY_LENGTH) {
    throw new Error('Secret key must decode to exactly 32 bytes');
  }
  return key;
}
