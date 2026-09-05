import { randomUUID } from 'node:crypto';
import type { EmailAccountStore, CreateEmailAccountInput, UpdateEmailAccountInput } from '../../application/email-account-store.js';
import type { EmailAccount } from '../../domain/smtp-provider.js';

export class InMemoryEmailAccountStore implements EmailAccountStore {
  private accounts: EmailAccount[] = [];
  private projectDefaults = new Map<string, string>();
  private projectAccounts = new Map<string, Set<string>>();

  constructor(
    accounts: readonly EmailAccount[] = [],
    projectDefaults: Map<string, string> = new Map(),
    projectAccounts: Map<string, readonly string[]> = new Map(),
  ) {
    this.accounts = [...accounts];
    this.projectDefaults = new Map(projectDefaults);
    this.projectAccounts = new Map(
      [...projectAccounts.entries()].map(([k, v]) => [k, new Set(v)]),
    );
  }

  async findById(id: string): Promise<EmailAccount | null> {
    return this.accounts.find((account) => account.id === id) ?? null;
  }

  async findByNameForProject(projectId: string, name: string): Promise<EmailAccount | null> {
    const allowed = this.projectAccounts.get(projectId);
    const account = this.accounts.find((item) => item.name === name);
    if (!account || (allowed && !allowed.has(account.id))) return null;
    return account;
  }

  async findDefaultForProject(projectId: string): Promise<EmailAccount | null> {
    const id = this.projectDefaults.get(projectId);
    if (!id) return null;
    return this.findById(id);
  }

  async list(): Promise<readonly EmailAccount[]> {
    return this.accounts;
  }

  async listWithProjectLinks(): Promise<
    readonly { account: EmailAccount; projectIds: readonly string[]; isDefaultFor: readonly string[] }[]
  > {
    return this.accounts.map((account) => ({
      account,
      projectIds: [...this.getProjectsForAccount(account.id)],
      isDefaultFor: [...this.getDefaultProjectsForAccount(account.id)],
    }));
  }

  async create(input: CreateEmailAccountInput): Promise<EmailAccount> {
    const account: EmailAccount = {
      id: randomUUID(),
      name: input.name,
      email: input.email,
      provider: input.provider,
      credentials: input.credentials,
      active: input.active ?? true,
    };
    this.accounts.push(account);
    return account;
  }

  async update(id: string, input: UpdateEmailAccountInput): Promise<EmailAccount> {
    const index = this.accounts.findIndex((a) => a.id === id);
    if (index === -1) throw new Error(`Email account not found: ${id}`);

    const current = this.accounts[index]!;
    const updated: EmailAccount = {
      id: current.id,
      name: input.name ?? current.name,
      email: input.email ?? current.email,
      provider: input.provider ?? current.provider,
      credentials: input.credentials ?? current.credentials,
      active: input.active ?? current.active,
    };
    this.accounts[index] = updated;
    return updated;
  }

  async delete(id: string): Promise<void> {
    const index = this.accounts.findIndex((a) => a.id === id);
    if (index === -1) throw new Error(`Email account not found: ${id}`);

    this.accounts.splice(index, 1);

    for (const [projectId, accounts] of this.projectAccounts) {
      accounts.delete(id);
      if (this.projectDefaults.get(projectId) === id) {
        this.projectDefaults.delete(projectId);
      }
    }
  }

  async linkToProject(projectId: string, emailAccountId: string, isDefault = false): Promise<void> {
    if (!this.accounts.find((a) => a.id === emailAccountId)) {
      throw new Error(`Email account not found: ${emailAccountId}`);
    }

    let accounts = this.projectAccounts.get(projectId);
    if (!accounts) {
      accounts = new Set();
      this.projectAccounts.set(projectId, accounts);
    }
    accounts.add(emailAccountId);

    if (isDefault) {
      const currentDefault = this.projectDefaults.get(projectId);
      if (currentDefault && currentDefault !== emailAccountId) {
        this.projectDefaults.delete(projectId);
      }
      this.projectDefaults.set(projectId, emailAccountId);
    }
  }

  async unlinkFromProject(projectId: string, emailAccountId: string): Promise<void> {
    const accounts = this.projectAccounts.get(projectId);
    if (!accounts) return;

    accounts.delete(emailAccountId);
    if (accounts.size === 0) {
      this.projectAccounts.delete(projectId);
    }

    if (this.projectDefaults.get(projectId) === emailAccountId) {
      this.projectDefaults.delete(projectId);
    }
  }

  async setDefaultForProject(projectId: string, emailAccountId: string): Promise<void> {
    const accounts = this.projectAccounts.get(projectId);
    if (!accounts || !accounts.has(emailAccountId)) {
      throw new Error(`Email account ${emailAccountId} is not linked to project ${projectId}`);
    }
    this.projectDefaults.set(projectId, emailAccountId);
  }

  private getProjectsForAccount(accountId: string): string[] {
    const projects: string[] = [];
    for (const [projectId, accounts] of this.projectAccounts) {
      if (accounts.has(accountId)) projects.push(projectId);
    }
    return projects;
  }

  private getDefaultProjectsForAccount(accountId: string): string[] {
    const projects: string[] = [];
    for (const [projectId, defaultId] of this.projectDefaults) {
      if (defaultId === accountId) projects.push(projectId);
    }
    return projects;
  }
}