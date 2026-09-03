export interface EncryptedSecret {
  version: 1;
  keyVersion: number;
  algorithm: 'aes-256-gcm';
  iv: string;
  authTag: string;
  ciphertext: string;
}

export interface SecretBox {
  encrypt(value: string): EncryptedSecret;
  decrypt(secret: EncryptedSecret): string;
}
