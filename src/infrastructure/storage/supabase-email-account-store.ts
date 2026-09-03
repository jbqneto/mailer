import type { SupabaseClient } from '@supabase/supabase-js';
import type { EmailAccountStore } from '../../application/email-account-store.js';
import { SmtpProvider, type EmailAccount } from '../../domain/smtp-provider.js';
import type { EncryptedSecret, SecretBox } from '../../security/secret-box.js';
import { z } from 'zod';

const encryptedSecretSchema = z.object({
  version: z.literal(1),
  keyVersion: z.number().int().positive(),
  algorithm: z.literal('aes-256-gcm'),
  iv: z.string().min(1),
  authTag: z.string().min(1),
  ciphertext: z.string().min(1),
}).strict();

const rowSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  email: z.string().email(),
  provider: z.literal(SmtpProvider.PURELY_MAIL),
  encrypted_credentials: encryptedSecretSchema,
  active: z.boolean(),
}).strict();

type EmailAccountRow = z.infer<typeof rowSchema>;

export class SupabaseEmailAccountStore implements EmailAccountStore {
  constructor(
    private readonly client: SupabaseClient,
    private readonly schema: string,
    private readonly secretBox: SecretBox,
  ) {}

  async findByNameForProject(projectId: string, name: string): Promise<EmailAccount | null> {
    const { data, error } = await this.client
      .schema(this.schema)
      .from('email_accounts')
      .select('id, name, email, provider, encrypted_credentials, active')
      .eq('name', name)
      .eq('active', true)
      .eq('project_email_accounts.project_id', projectId)
      .maybeSingle();

    if (error) throw new Error(`Failed to load email account: ${error.message}`);
    if (!data) return null;

    return this.toDomain(rowSchema.parse(data));
  }

  async findDefaultForProject(projectId: string): Promise<EmailAccount | null> {
    const { data, error } = await this.client
      .schema(this.schema)
      .from('project_email_accounts')
      .select('email_accounts(id, name, email, provider, encrypted_credentials, active)')
      .eq('project_id', projectId)
      .eq('is_default', true)
      .maybeSingle();

    if (error) throw new Error(`Failed to load default email account: ${error.message}`);
    if (!data?.email_accounts) return null;

    const account = rowSchema.parse(data.email_accounts);
    if (!account.active) return null;
    return this.toDomain(account);
  }

  private toDomain(row: EmailAccountRow): EmailAccount {
    const credentials = JSON.parse(this.secretBox.decrypt(row.encrypted_credentials as EncryptedSecret)) as {
      username?: unknown;
      password?: unknown;
    };

    if (typeof credentials.username !== 'string' || typeof credentials.password !== 'string') {
      throw new Error(`Invalid credentials for email account "${row.id}"`);
    }

    return {
      id: row.id,
      name: row.name,
      email: row.email,
      provider: row.provider,
      credentials: {
        username: credentials.username,
        password: credentials.password,
      },
      active: row.active,
    };
  }
}
