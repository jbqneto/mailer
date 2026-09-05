import type { SupabaseClient } from '@supabase/supabase-js';
import type { EmailAccountStore, CreateEmailAccountInput, UpdateEmailAccountInput } from '../../application/email-account-store.js';
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

  async listWithProjectLinks(): Promise<
    readonly { account: EmailAccount; projectIds: readonly string[]; isDefaultFor: readonly string[] }[]
  > {
    const { data: accountsData, error: accountsError } = await this.client
      .schema(this.schema)
      .from('email_accounts')
      .select('id, name, email, provider, encrypted_credentials, active');

    if (accountsError) throw new Error(`Failed to list email accounts: ${accountsError.message}`);

    const { data: linksData, error: linksError } = await this.client
      .schema(this.schema)
      .from('project_email_accounts')
      .select('project_id, email_account_id, is_default');

    if (linksError) throw new Error(`Failed to list project-email account links: ${linksError.message}`);

    const linksByAccount = new Map<string, { projectIds: string[]; isDefaultFor: string[] }>();
    for (const link of linksData ?? []) {
      const entry = linksByAccount.get(link.email_account_id) ?? { projectIds: [], isDefaultFor: [] };
      entry.projectIds.push(link.project_id);
      if (link.is_default) entry.isDefaultFor.push(link.project_id);
      linksByAccount.set(link.email_account_id, entry);
    }

    return (accountsData ?? []).map((row) => {
      const parsed = parseRow(row);
      const links = linksByAccount.get(parsed.id) ?? { projectIds: [], isDefaultFor: [] };
      return {
        account: this.toDomain(parsed),
        projectIds: links.projectIds,
        isDefaultFor: links.isDefaultFor,
      };
    });
  }

  async create(input: CreateEmailAccountInput): Promise<EmailAccount> {
    const encrypted = this.secretBox.encrypt(JSON.stringify(input.credentials));
    const { data, error } = await this.client
      .schema(this.schema)
      .from('email_accounts')
      .insert({
        name: input.name,
        email: input.email,
        provider: input.provider,
        encrypted_credentials: encrypted,
        active: input.active ?? true,
      })
      .select('id, name, email, provider, encrypted_credentials, active')
      .single();

    if (error) throw new Error(`Failed to create email account: ${error.message}`);
    return this.toDomain(parseRow(data));
  }

  async update(id: string, input: UpdateEmailAccountInput): Promise<EmailAccount> {
    const updates: Record<string, unknown> = {};
    if (input.name !== undefined) updates.name = input.name;
    if (input.email !== undefined) updates.email = input.email;
    if (input.provider !== undefined) updates.provider = input.provider;
    if (input.credentials !== undefined) {
      updates.encrypted_credentials = this.secretBox.encrypt(JSON.stringify(input.credentials));
    }
    if (input.active !== undefined) updates.active = input.active;

    if (Object.keys(updates).length === 0) {
      return this.findById(id).then((a) => {
        if (!a) throw new Error(`Email account not found: ${id}`);
        return a;
      });
    }

    const { data, error } = await this.client
      .schema(this.schema)
      .from('email_accounts')
      .update(updates)
      .eq('id', id)
      .select('id, name, email, provider, encrypted_credentials, active')
      .single();

    if (error) throw new Error(`Failed to update email account: ${error.message}`);
    if (!data) throw new Error(`Email account not found: ${id}`);
    return this.toDomain(parseRow(data));
  }

  async delete(id: string): Promise<void> {
    const { error } = await this.client
      .schema(this.schema)
      .from('email_accounts')
      .delete()
      .eq('id', id);

    if (error) throw new Error(`Failed to delete email account: ${error.message}`);
  }

  async linkToProject(projectId: string, emailAccountId: string, isDefault = false): Promise<void> {
    if (isDefault) {
      await this.client
        .schema(this.schema)
        .from('project_email_accounts')
        .update({ is_default: false })
        .eq('project_id', projectId)
        .eq('is_default', true);
    }

    const { error } = await this.client
      .schema(this.schema)
      .from('project_email_accounts')
      .upsert({ project_id: projectId, email_account_id: emailAccountId, is_default: isDefault }, { onConflict: 'project_id,email_account_id' });

    if (error) throw new Error(`Failed to link email account to project: ${error.message}`);
  }

  async unlinkFromProject(projectId: string, emailAccountId: string): Promise<void> {
    const { error } = await this.client
      .schema(this.schema)
      .from('project_email_accounts')
      .delete()
      .eq('project_id', projectId)
      .eq('email_account_id', emailAccountId);

    if (error) throw new Error(`Failed to unlink email account from project: ${error.message}`);
  }

  async setDefaultForProject(projectId: string, emailAccountId: string): Promise<void> {
    const { error: checkError } = await this.client
      .schema(this.schema)
      .from('project_email_accounts')
      .select('id')
      .eq('project_id', projectId)
      .eq('email_account_id', emailAccountId)
      .maybeSingle();

    if (checkError) throw new Error(`Failed to verify link: ${checkError.message}`);
    if (!checkError) throw new Error(`Email account ${emailAccountId} is not linked to project ${projectId}`);

    await this.client
      .schema(this.schema)
      .from('project_email_accounts')
      .update({ is_default: false })
      .eq('project_id', projectId)
      .eq('is_default', true);

    const { error } = await this.client
      .schema(this.schema)
      .from('project_email_accounts')
      .update({ is_default: true })
      .eq('project_id', projectId)
      .eq('email_account_id', emailAccountId);

    if (error) throw new Error(`Failed to set default email account: ${error.message}`);
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