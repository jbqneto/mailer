import { describe, expect, it } from 'vitest';
import type { EmailDelivery } from '../../domain/email-delivery.js';
import { InMemoryEmailDeliveryStore } from './in-memory-email-delivery-store.js';

const delivery: EmailDelivery = {
  id: 'email_test_1',
  projectId: 'project-a',
  template: 'welcome-user',
  to: ['user@example.com'],
  subject: 'Welcome',
  status: 'processing',
  createdAt: '2026-08-08T12:00:00.000Z',
  idempotencyKey: 'welcome:user-1',
  payloadHash: 'hash-1',
};

describe('InMemoryEmailDeliveryStore', () => {
  it('keeps idempotency for the configured TTL', async () => {
    const store = new InMemoryEmailDeliveryStore(60_000);
    expect((await store.reserve(delivery)).kind).toBe('reserved');
    expect((await store.reserve({ ...delivery, id: 'email_test_2' })).kind).toBe('existing');
  });

  it('allows the key to be reused after its TTL expires', async () => {
    const store = new InMemoryEmailDeliveryStore(-1);
    expect((await store.reserve(delivery)).kind).toBe('reserved');
    expect((await store.reserve({ ...delivery, id: 'email_test_2' })).kind).toBe('reserved');
  });

  it('releases a failed key while preserving the delivery record', async () => {
    const store = new InMemoryEmailDeliveryStore();
    await store.reserve(delivery);
    await store.update(delivery.id, { status: 'failed', failedAt: '2026-08-08T12:01:00.000Z' });
    await store.releaseIdempotency(delivery.projectId, delivery.idempotencyKey!, delivery.id);

    expect((await store.reserve({ ...delivery, id: 'email_test_2' })).kind).toBe('reserved');
    expect((await store.getById(delivery.id))?.status).toBe('failed');
  });
});
