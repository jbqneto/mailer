export interface ProjectConfig {
  id: string;
  apiKey: string;
  fromEmail: string;
  fromName: string;
  replyTo?: string;
  allowedTemplates: readonly string[];

  /** @deprecated SMTP connection settings are now stored in email_accounts. */
  smtp?: {
    host: string;
    port: number;
    secure: boolean;
    auth: false | { user: string; password: string };
  };
}
