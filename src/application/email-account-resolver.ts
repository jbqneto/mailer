import type { EmailAccountStore } from './email-account-store.js';
import type { EmailAccount } from '../domain/smtp-provider.js';

export class EmailAccountNotFoundError extends Error {
  constructor(readonly projectId: string, readonly requestedName?: string) {
    super(
      requestedName
        ? `Email account "${requestedName}" was not found for project "${projectId}"`
        : `No default email account was configured for project "${projectId}"`,
    );
    this.name = 'EmailAccountNotFoundError';
  }
}

export class EmailAccountInactiveError extends Error {
  constructor(readonly accountId: string) {
    super('The selected email account is inactive');
    this.name = 'EmailAccountInactiveError';
  }
}

export class EmailAccountResolver {
  constructor(private readonly store: EmailAccountStore) {}

  async resolve(projectId: string, name?: string): Promise<EmailAccount> {
    const account = name
      ? await this.store.findByNameForProject(projectId, name)
      : await this.store.findDefaultForProject(projectId);
    return this.assertUsable(account, projectId, name);
  }

  async resolveById(id: string, projectId: string): Promise<EmailAccount> {
    const account = await this.store.findById(id);
    if (!account) throw new EmailAccountNotFoundError(projectId, id);
    return this.assertUsable(account, projectId);
  }

  private assertUsable(
    account: EmailAccount | null,
    projectId: string,
    requestedName?: string,
  ): EmailAccount {
    if (!account) throw new EmailAccountNotFoundError(projectId, requestedName);
    if (!account.active) throw new EmailAccountInactiveError(account.id);
    return account;
  }
}
