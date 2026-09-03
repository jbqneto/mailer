import { describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import { Aes256GcmSecretBox } from './aes-256-gcm-secret-box.js';

describe('Aes256GcmSecretBox', () => {
  it('encrypts and decrypts a secret', () => {
    const box = new Aes256GcmSecretBox(randomBytes(32));
    const encrypted = box.encrypt(JSON.stringify({ username: 'user', password: 'secret' }));

    expect(encrypted.ciphertext).not.toContain('secret');
    expect(box.decrypt(encrypted)).toBe(JSON.stringify({ username: 'user', password: 'secret' }));
  });

  it('uses a different IV for every encryption', () => {
    const box = new Aes256GcmSecretBox(randomBytes(32));
    const first = box.encrypt('secret');
    const second = box.encrypt('secret');

    expect(second.iv).not.toBe(first.iv);
    expect(second.ciphertext).not.toBe(first.ciphertext);
  });

  it('rejects tampered ciphertext', () => {
    const box = new Aes256GcmSecretBox(randomBytes(32));
    const encrypted = box.encrypt('secret');
    encrypted.ciphertext = `${encrypted.ciphertext.slice(0, -1)}A`;

    expect(() => box.decrypt(encrypted)).toThrow();
  });

  it('requires a 32-byte key', () => {
    expect(() => new Aes256GcmSecretBox(randomBytes(31))).toThrow(/32 bytes/);
  });
});
