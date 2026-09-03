import dotenv from 'dotenv';

dotenv.config({ path: process.env.ENV_FILE ?? '.env' });
import { runtimeEnv } from '../config/env.js';
import { loadProjects } from '../config/projects.js';
import { SmtpProvider, type EmailAccount } from '../domain/smtp-provider.js';
import { SmtpEmailProvider } from '../infrastructure/smtp/smtp-email-provider.js';
import { createEmailAccountStore } from '../infrastructure/storage/create-email-account-store.js';
import { InMemoryEmailAccountStore } from '../infrastructure/storage/in-memory-email-account-store.js';
import type { EmailAccountStore } from '../application/email-account-store.js';

const projects = loadProjects();
let accountStore: EmailAccountStore;
let provider: SmtpEmailProvider;

if (runtimeEnv.NODE_ENV === 'production') {
  if (!runtimeEnv.SUPABASE_URL || !runtimeEnv.SUPABASE_SERVICE_ROLE_KEY || !runtimeEnv.MAILER_MASTER_KEY) {
    throw new Error('SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and MAILER_MASTER_KEY are required in production');
  }
  accountStore = createEmailAccountStore({
    supabaseUrl: runtimeEnv.SUPABASE_URL,
    serviceRoleKey: runtimeEnv.SUPABASE_SERVICE_ROLE_KEY,
    schema: runtimeEnv.SUPABASE_SCHEMA,
    masterKey: runtimeEnv.MAILER_MASTER_KEY,
  });
  provider = new SmtpEmailProvider(SmtpProvider.PURELY_MAIL, {
    maxAttempts: runtimeEnv.SMTP_MAX_ATTEMPTS,
    initialDelayMs: runtimeEnv.SMTP_RETRY_DELAY_MS,
  });
} else {
  const accounts: EmailAccount[] = projects.map((project) => ({
    id: `dev-account-${project.id}`,
    name: `${project.id}-default`,
    email: project.fromEmail,
    provider: SmtpProvider.MAILPIT,
    credentials: { username: '', password: '' },
    active: true,
  }));
  const defaults = new Map(projects.map((project) => [project.id, `dev-account-${project.id}`]));
  const projectAccounts = new Map(projects.map((project) => [project.id, [`dev-account-${project.id}`]] as const));
  accountStore = new InMemoryEmailAccountStore(accounts, defaults, projectAccounts);
  provider = new SmtpEmailProvider(SmtpProvider.MAILPIT, {
    maxAttempts: runtimeEnv.SMTP_MAX_ATTEMPTS,
    initialDelayMs: runtimeEnv.SMTP_RETRY_DELAY_MS,
  });
}

let failed = false;

for (const project of projects) {
  const account = await accountStore.findDefaultForProject(project.id);
  process.stdout.write(`Verifying email account for ${project.id}... `);

  if (!account) {
    failed = true;
    console.log('FAILED');
    console.error('  No default email account is configured');
    continue;
  }

  try {
    await provider.verify(account);
    console.log('OK');
  } catch (error) {
    failed = true;
    console.log('FAILED');
    console.error(`  ${error instanceof Error ? error.message : 'Unknown SMTP verification error'}`);
  }
}

await provider.close();
if (failed) process.exitCode = 1;
