import { createClient } from '@supabase/supabase-js';
import type { EmailAccountStore } from '../../application/email-account-store.js';
import { SupabaseEmailAccountStore } from './supabase-email-account-store.js';
import { Aes256GcmSecretBox, parseSecretKey } from '../../security/aes-256-gcm-secret-box.js';

export function createEmailAccountStore(options: {
  supabaseUrl: string;
  serviceRoleKey: string;
  schema: string;
  masterKey: string;
}): EmailAccountStore {
  const client = createClient(options.supabaseUrl, options.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  return new SupabaseEmailAccountStore(
    client,
    options.schema,
    new Aes256GcmSecretBox(parseSecretKey(options.masterKey)),
  );
}
