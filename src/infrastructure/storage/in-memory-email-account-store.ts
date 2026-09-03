import type { EmailAccountStore } from '../../application/email-account-store.js';
import type { EmailAccount } from '../../domain/smtp-provider.js';

export class InMemoryEmailAccountStore implements EmailAccountStore {
  constructor(
    private readonly accounts: readonly EmailAccount[] = [],
    private readonly projectDefaults = new Map<string, string>(),
    private readonly projectAccounts = new Map<string, readonly string[]>(),
  ) {}

  async findById(id: string): Promise<EmailAccount | null> {
    return this.accounts.find((account) => account.id === id) ?? null;
  }

  async findByNameForProject(projectId: string, name: string): Promise<EmailAccount | null> {
    const allowed = this.projectAccounts.get(projectId);
    const account = this.accounts.find((item) => item.name === name);
    if (!account || (allowed && !allowed.includes(account.id))) return null;
    return account;
  }

  async findDefaultForProject(projectId: string): Promise<EmailAccount | null> {
    const id = this.projectDefaults.get(projectId);
    if (!id) return null;
    return this.findById(id);
  }
}
