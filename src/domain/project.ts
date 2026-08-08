export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  auth:
    | false
    | {
        user: string;
        password: string;
      };
}

export interface ProjectConfig {
  id: string;
  apiKey: string;
  fromEmail: string;
  fromName: string;
  replyTo?: string;
  smtp: SmtpConfig;
  allowedTemplates: readonly string[];
}
