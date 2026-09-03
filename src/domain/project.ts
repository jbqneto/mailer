export interface ProjectConfig {
  id: string;
  apiKey: string;
  fromEmail: string;
  fromName: string;
  replyTo?: string;
  allowedTemplates: readonly string[];
}
