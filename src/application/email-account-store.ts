import type { EmailAccount } from '../domain/smtp-provider.js';

export interface EmailAccountStore {
  findById(id: string): Promise<EmailAccount | null>;
  findByNameForProject(projectId: string, name: string): Promise<EmailAccount | null>;
  findDefaultForProject(projectId: string): Promise<EmailAccount | null>;
}
