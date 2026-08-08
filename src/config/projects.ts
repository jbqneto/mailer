import { z } from 'zod';
import { PROJECT_DEFINITIONS } from './project-definitions.js';
import type { ProjectConfig } from '../domain/project.js';
import { assertProductionValue } from './production-config.js';

const emailSchema = z.string().email();
const apiKeySchema = z.string().min(32);

function required(prefix: string, suffix: string): string {
  const key = `${prefix}_${suffix}`;
  const value = process.env[key];

  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }

  assertProductionValue(key, value);

  return value;
}

function optional(prefix: string, suffix: string): string | undefined {
  const value = process.env[`${prefix}_${suffix}`]?.trim();
  return value ? value : undefined;
}

function parseBoolean(value: string, key: string): boolean {
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error(`${key} must be "true" or "false"`);
}

function loadProject(
  definition: (typeof PROJECT_DEFINITIONS)[number],
): ProjectConfig {
  const prefix = definition.envPrefix;

  const apiKey = apiKeySchema.parse(required(prefix, 'API_KEY'));
  const fromEmail = emailSchema.parse(required(prefix, 'FROM_EMAIL'));
  const fromName = required(prefix, 'FROM_NAME');
  const replyToRaw = optional(prefix, 'REPLY_TO');
  const replyTo = replyToRaw ? emailSchema.parse(replyToRaw) : undefined;

  const portRaw = required(prefix, 'SMTP_PORT');
  const port = z.coerce.number().int().min(1).max(65535).parse(portRaw);

  const secureKey = `${prefix}_SMTP_SECURE`;
  const secure = parseBoolean(required(prefix, 'SMTP_SECURE'), secureKey);
  const authKey = `${prefix}_SMTP_AUTH`;
  const authEnabled = parseBoolean(required(prefix, 'SMTP_AUTH'), authKey);

  const auth = authEnabled
    ? {
        user: required(prefix, 'SMTP_USER'),
        password: required(prefix, 'SMTP_PASSWORD'),
      }
    : false;

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
      auth,
    },
    allowedTemplates: definition.allowedTemplates,
  };
}

export function loadProjects(): ProjectConfig[] {
  const projects: ProjectConfig[] = [];
  const errors: string[] = [];

  for (const definition of PROJECT_DEFINITIONS) {
    try {
      projects.push(loadProject(definition));
    } catch (error) {
      errors.push(
        `${definition.id}: ${error instanceof Error ? error.message : 'invalid configuration'}`,
      );
    }
  }

  if (errors.length > 0) {
    throw new Error(`Invalid project configuration:\n${errors.map((error) => `- ${error}`).join('\n')}`);
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
