import { createClient } from '@supabase/supabase-js';
import type { EmailDeliveryStore } from '../../domain/email-delivery.js';
import { InMemoryEmailDeliveryStore } from './in-memory-email-delivery-store.js';
import { SupabaseEmailDeliveryStore } from './supabase-email-delivery-store.js';

export function createEmailDeliveryStore(): EmailDeliveryStore {
  if (process.env.DELIVERY_STORE !== 'supabase') return new InMemoryEmailDeliveryStore();

  const url = process.env.SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceRoleKey) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required when DELIVERY_STORE=supabase');
  }

  return new SupabaseEmailDeliveryStore(
    createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } }),
  );
}
