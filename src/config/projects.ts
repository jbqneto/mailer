import { z } from 'zod';
import { PROJECT_DEFINITIONS, type ProjectDefinition } from './project-definitions.js';
import type { ProjectConfig } from '../domain/project.js';
import { assertProductionValue } from './production-config.js';

const emailSchema = z.string().email();
const apiKeySchema = z.string().min(32);

function required(prefix: string, suffix: string): string {
  const key = `${prefix}_${suffix}`;
  const value = process.env[key]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }

  assertProductionValue(key, value);
  return value;
}

function optional(prefix: string, suffix: string): string | undefined {
  const key = `${prefix}_${suffix}`;
  const value = process.env[key]?.trim();

  if (!value) return undefined;

  assertProductionValue(key, value);
  return value;
}

function parseBoolean(value: string, key: string): boolean {
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error(`${key} must be "true" or "false"`);
}

function loadProject(definition: ProjectDefinition): ProjectConfig {
  const prefix = definition.envPrefix;
  const apiKey = apiKeySchema.parse(required(prefix, 'API_KEY'));
  const fromEmail = emailSchema.parse(required(prefix, 'FROM_EMAIL'));
  const fromName = optional(prefix, 'FROM_NAME') ?? fromEmail;
  const replyToRaw = optional(prefix, 'REPLY_TO');
  const replyTo = replyToRaw ? emailSchema.parse(replyToRaw) : undefined;

  const port = z.coerce.number().int().min(1).max(65535).parse(
    required(prefix, 'SMTP_PORT'),
  );
  const secure = parseBoolean(
    required(prefix, 'SMTP_SECURE'),
    `${prefix}_SMTP_SECURE`,
  );

  const user = optional(prefix, 'SMTP_USER');
  const password = optional(prefix, 'SMTP_PASSWORD');
  const authRaw = optional(prefix, 'SMTP_AUTH');
  const authEnabled = authRaw === undefined
    ? Boolean(user || password)
    : parseBoolean(authRaw, `${prefix}_SMTP_AUTH`);

  if (authEnabled && (!user || !password)) {
    throw new Error(
      `${prefix}_SMTP_USER and ${prefix}_SMTP_PASSWORD are required when SMTP authentication is enabled`,
    );
  }

  return {
    id: definition.id,
    apiKey,
    fromEmail,
    fromName,
    ...(replyTo ? { replyTo } : {}),
    smtp: {
      host: required(prefix, 'SMTP_HOST'),
      port,
      secure,
      auth: authEnabled ? { user: user!, password: password! } : false,
    },
    allowedTemplates: definition.allowedTemplates,
  };
}

export function loadProjects(
  definitions: readonly ProjectDefinition[] = PROJECT_DEFINITIONS,
): ProjectConfig[] {
  const activeDefinitions = definitions.filter((definition) => definition.active);
  const projects: ProjectConfig[] = [];
  const errors: string[] = [];

  for (const definition of activeDefinitions) {
    try {
      projects.push(loadProject(definition));
    } catch (error) {
      errors.push(
        `${definition.id}: ${error instanceof Error ? error.message : 'invalid configuration'}`,
      );
    }
  }

  if (errors.length > 0) {
    throw new Error(
      `Invalid project configuration:\n${errors.map((error) => `- ${error}`).join('\n')}`,
    );
  }

  const ids = new Set(projects.map((project) => project.id));
  if (ids.size !== projects.length) {
    throw new Error('Project IDs must be unique');
  }

  const apiKeys = new Set(projects.map((project) => project.apiKey));
  if (apiKeys.size !== projects.length) {
    throw new Error('Project API keys must be unique');
  }

  return projects;
}
