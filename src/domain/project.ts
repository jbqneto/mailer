export interface ProjectConfig {
  id: string;
  apiKey: string;
  fromName: string;
  replyTo?: string;
  allowedTemplates: readonly string[];
}
