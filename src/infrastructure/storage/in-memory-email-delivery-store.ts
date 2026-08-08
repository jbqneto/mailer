import type {
  EmailDelivery,
  EmailDeliveryFilter,
  EmailDeliveryReservation,
  EmailDeliveryStore,
} from '../../domain/email-delivery.js';

function clone(delivery: EmailDelivery): EmailDelivery {
  return { ...delivery, to: [...delivery.to] };
}

export class InMemoryEmailDeliveryStore implements EmailDeliveryStore {
  private readonly deliveries = new Map<string, EmailDelivery>();
  private readonly idempotency = new Map<string, { deliveryId: string; expiresAt: number }>();

  constructor(private readonly idempotencyTtlMs = 24 * 60 * 60 * 1000) {}

  async reserve(delivery: EmailDelivery): Promise<EmailDeliveryReservation> {
    const key = delivery.idempotencyKey
      ? `${delivery.projectId}:${delivery.idempotencyKey}`
      : undefined;

    if (key) {
      const existingEntry = this.idempotency.get(key);
      if (existingEntry && existingEntry.expiresAt > Date.now()) {
        const existing = this.deliveries.get(existingEntry.deliveryId);
        if (existing) return { kind: 'existing', delivery: clone(existing) };
        this.idempotency.delete(key);
      } else if (existingEntry) {
        this.idempotency.delete(key);
      }
      this.idempotency.set(key, { deliveryId: delivery.id, expiresAt: Date.now() + this.idempotencyTtlMs });
    }

    this.deliveries.set(delivery.id, clone(delivery));
    return { kind: 'reserved', delivery: clone(delivery) };
  }

  async update(
    id: string,
    patch: Partial<Pick<EmailDelivery, 'status' | 'acceptedAt' | 'failedAt' | 'providerMessageId' | 'errorCode'>>,
  ): Promise<EmailDelivery> {
    const current = this.deliveries.get(id);
    if (!current) throw new Error(`Email delivery ${id} was not found`);
    const updated = { ...current, ...patch };
    this.deliveries.set(id, updated);
    return clone(updated);
  }

  async releaseIdempotency(
    projectId: string,
    idempotencyKey: string,
    deliveryId: string,
  ): Promise<void> {
    const key = `${projectId}:${idempotencyKey}`;
    if (this.idempotency.get(key)?.deliveryId === deliveryId) this.idempotency.delete(key);
  }

  async getById(id: string): Promise<EmailDelivery | undefined> {
    const delivery = this.deliveries.get(id);
    return delivery ? clone(delivery) : undefined;
  }

  async list(filter: EmailDeliveryFilter = {}): Promise<EmailDelivery[]> {
    const limit = Math.min(Math.max(filter.limit ?? 50, 1), 100);
    return [...this.deliveries.values()]
      .filter((delivery) => !filter.projectId || delivery.projectId === filter.projectId)
      .filter((delivery) => !filter.status || delivery.status === filter.status)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit)
      .map(clone);
  }
}
