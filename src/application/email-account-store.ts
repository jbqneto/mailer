import type { EmailAccount } from '../domain/smtp-provider.js';

export interface EmailAccountStore {
  findByNameForProject(projectId: string, name: string): Promise<EmailAccount | null>;
  findDefaultForProject(projectId: string): Promise<EmailAccount | null>;
}
