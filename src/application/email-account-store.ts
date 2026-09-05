import type { EmailAccount } from '../domain/smtp-provider.js';
import { SmtpProvider } from '../domain/smtp-provider.js';

export interface CreateEmailAccountInput {
  name: string;
  email: string;
  provider: SmtpProvider;
  credentials: { username: string; password: string };
  active?: boolean | undefined;
}

export interface UpdateEmailAccountInput {
  name?: string | undefined;
  email?: string | undefined;
  provider?: SmtpProvider | undefined;
  credentials?: { username: string; password: string } | undefined;
  active?: boolean | undefined;
}

export interface ProjectEmailAccountLink {
  projectId: string;
  emailAccountId: string;
  isDefault: boolean;
}

export interface EmailAccountStore {
  findById(id: string): Promise<EmailAccount | null>;
  findByNameForProject(projectId: string, name: string): Promise<EmailAccount | null>;
  findDefaultForProject(projectId: string): Promise<EmailAccount | null>;
  list(): Promise<readonly EmailAccount[]>;
  listWithProjectLinks(): Promise<readonly { account: EmailAccount; projectIds: readonly string[]; isDefaultFor: readonly string[] }[]>;
  create(input: CreateEmailAccountInput): Promise<EmailAccount>;
  update(id: string, input: UpdateEmailAccountInput): Promise<EmailAccount>;
  delete(id: string): Promise<void>;
  linkToProject(projectId: string, emailAccountId: string, isDefault?: boolean): Promise<void>;
  unlinkFromProject(projectId: string, emailAccountId: string): Promise<void>;
  setDefaultForProject(projectId: string, emailAccountId: string): Promise<void>;
}
