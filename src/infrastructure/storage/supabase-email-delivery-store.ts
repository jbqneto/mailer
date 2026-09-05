import type { SupabaseClient } from '@supabase/supabase-js';
import type { EmailDelivery, EmailDeliveryFilter, EmailDeliveryReservation, EmailDeliveryStore } from '../../domain/email-delivery.js';

interface DeliveryRow {
  id: string;
  project_id: string;
  email_account_id: string;
  template: string;
  recipients: unknown;
  subject: string;
  status: EmailDelivery['status'];
  created_at: string;
  accepted_at: string | null;
  failed_at: string | null;
  provider_message_id: string | null;
  error_code: string | null;
  idempotency_key: string | null;
  payload_hash: string | null;
}

function fromRow(row: DeliveryRow): EmailDelivery {
  if (!Array.isArray(row.recipients) || !row.recipients.every((item) => typeof item === 'string')) throw new Error(`Invalid recipients stored for email delivery ${row.id}`);
  return {
    id: row.id,
    projectId: row.project_id,
    emailAccountId: row.email_account_id,
    template: row.template,
    to: row.recipients,
    subject: row.subject,
    status: row.status,
    createdAt: row.created_at,
    ...(row.accepted_at ? { acceptedAt: row.accepted_at } : {}),
    ...(row.failed_at ? { failedAt: row.failed_at } : {}),
    ...(row.provider_message_id ? { providerMessageId: row.provider_message_id } : {}),
    ...(row.error_code ? { errorCode: row.error_code } : {}),
    ...(row.idempotency_key ? { idempotencyKey: row.idempotency_key } : {}),
    ...(row.payload_hash ? { payloadHash: row.payload_hash } : {}),
  };
}

function toRow(delivery: EmailDelivery): DeliveryRow {
  return {
    id: delivery.id,
    project_id: delivery.projectId,
    email_account_id: delivery.emailAccountId,
    template: delivery.template,
    recipients: delivery.to,
    subject: delivery.subject,
    status: delivery.status,
    created_at: delivery.createdAt,
    accepted_at: delivery.acceptedAt ?? null,
    failed_at: delivery.failedAt ?? null,
    provider_message_id: delivery.providerMessageId ?? null,
    error_code: delivery.errorCode ?? null,
    idempotency_key: delivery.idempotencyKey ?? null,
    payload_hash: delivery.payloadHash ?? null,
  };
}

export class SupabaseEmailDeliveryStore implements EmailDeliveryStore {
  constructor(private readonly client: SupabaseClient, private readonly schema = 'email_gateway', private readonly table = 'email_deliveries') {}

  async reserve(delivery: EmailDelivery): Promise<EmailDeliveryReservation> {
    const { data, error } = await this.client.schema(this.schema).from(this.table).insert(toRow(delivery)).select().maybeSingle();
    if (!error && data) return { kind: 'reserved', delivery: fromRow(data as DeliveryRow) };
    if (error?.code === '23505' && delivery.idempotencyKey) {
      const existing = await this.findByIdempotency(delivery.projectId, delivery.idempotencyKey);
      if (existing) return { kind: 'existing', delivery: existing };
    }
    throw new Error(`Could not reserve email delivery: ${error?.message ?? 'empty database response'}`);
  }

  async update(id: string, patch: Partial<Pick<EmailDelivery, 'status' | 'acceptedAt' | 'failedAt' | 'providerMessageId' | 'errorCode'>>): Promise<EmailDelivery> {
    const values = {
      ...(patch.status ? { status: patch.status } : {}),
      ...(patch.acceptedAt ? { accepted_at: patch.acceptedAt } : {}),
      ...(patch.failedAt ? { failed_at: patch.failedAt } : {}),
      ...(patch.providerMessageId ? { provider_message_id: patch.providerMessageId } : {}),
      ...(patch.errorCode ? { error_code: patch.errorCode } : {}),
    };
    const { data, error } = await this.client.schema(this.schema).from(this.table).update(values).eq('id', id).select().single();
    if (error || !data) throw new Error(`Could not update email delivery: ${error?.message ?? 'not found'}`);
    return fromRow(data as DeliveryRow);
  }

  async releaseIdempotency(projectId: string, idempotencyKey: string, deliveryId: string): Promise<void> {
    const { error } = await this.client.schema(this.schema).from(this.table).update({ idempotency_key: null, payload_hash: null }).eq('id', deliveryId).eq('project_id', projectId).eq('idempotency_key', idempotencyKey);
    if (error) throw new Error(`Could not release email idempotency: ${error.message}`);
  }

  async getById(id: string): Promise<EmailDelivery | undefined> {
    const { data, error } = await this.client.schema(this.schema).from(this.table).select('*').eq('id', id).maybeSingle();
    if (error) throw new Error(`Could not read email delivery: ${error.message}`);
    return data ? fromRow(data as DeliveryRow) : undefined;
  }

  async list(filter: EmailDeliveryFilter = {}): Promise<EmailDelivery[]> {
    const limit = Math.min(Math.max(filter.limit ?? 50, 1), 100);
    let query = this.client.schema(this.schema).from(this.table).select('*').order('created_at', { ascending: false }).limit(limit);
    if (filter.projectId) query = query.eq('project_id', filter.projectId);
    if (filter.status) query = query.eq('status', filter.status);
    const { data, error } = await query;
    if (error) throw new Error(`Could not list email deliveries: ${error.message}`);
    return (data as DeliveryRow[]).map(fromRow);
  }

  private async findByIdempotency(projectId: string, idempotencyKey: string): Promise<EmailDelivery | undefined> {
    const { data, error } = await this.client.schema(this.schema).from(this.table).select('*').eq('project_id', projectId).eq('idempotency_key', idempotencyKey).maybeSingle();
    if (error) throw new Error(`Could not read idempotent email delivery: ${error.message}`);
    return data ? fromRow(data as DeliveryRow) : undefined;
  }
}
