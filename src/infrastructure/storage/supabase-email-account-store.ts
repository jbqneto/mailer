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

const credentialsSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
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

function parseRow(data: unknown): EmailAccountRow {
  const value = data as Record<string, unknown>;
  return rowSchema.parse({
    id: value.id,
    name: value.name,
    email: value.email,
    provider: value.provider,
    encrypted_credentials: value.encrypted_credentials,
    active: value.active,
  });
}

export class SupabaseEmailAccountStore implements EmailAccountStore {
  constructor(
    private readonly client: SupabaseClient,
    private readonly schema: string,
    private readonly secretBox: SecretBox,
  ) {}

  async findById(id: string): Promise<EmailAccount | null> {
    const { data, error } = await this.client
      .schema(this.schema)
      .from('email_accounts')
      .select('id, name, email, provider, encrypted_credentials, active')
      .eq('id', id)
      .maybeSingle();

    if (error) throw new Error(`Failed to load email account: ${error.message}`);
    if (!data) return null;
    return this.toDomain(parseRow(data));
  }

  async findByNameForProject(projectId: string, name: string): Promise<EmailAccount | null> {
    const { data, error } = await this.client
      .schema(this.schema)
      .from('email_accounts')
      .select('id, name, email, provider, encrypted_credentials, active, project_email_accounts!inner(project_id)')
      .eq('name', name)
      .eq('project_email_accounts.project_id', projectId)
      .maybeSingle();

    if (error) throw new Error(`Failed to load email account: ${error.message}`);
    if (!data) return null;

    return this.toDomain(parseRow(data));
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

    return this.toDomain(parseRow(data.email_accounts));
  }

  async list(): Promise<readonly EmailAccount[]> {
    const { data, error } = await this.client
      .schema(this.schema)
      .from('email_accounts')
      .select('id, name, email, provider, encrypted_credentials, active');

    if (error) throw new Error(`Failed to list email accounts: ${error.message}`);
    return (data ?? []).map((row) => this.toDomain(parseRow(row)));
  }

  private toDomain(row: EmailAccountRow): EmailAccount {
    let decrypted: unknown;
    try {
      decrypted = JSON.parse(this.secretBox.decrypt(row.encrypted_credentials as EncryptedSecret));
    } catch {
      throw new Error(`Failed to decrypt credentials for email account "${row.id}"`);
    }

    return {
      id: row.id,
      name: row.name,
      email: row.email,
      provider: row.provider,
      credentials: credentialsSchema.parse(decrypted),
      active: row.active,
    };
  }
}
