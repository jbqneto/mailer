import { z } from 'zod';
import { PROJECT_DEFINITIONS, type ProjectDefinition } from './project-definitions.js';
import type { ProjectConfig } from '../domain/project.js';
import { assertProductionValue } from './production-config.js';

const emailSchema = z.string().email();
const apiKeySchema = z.string().min(32);

function required(prefix: string, suffix: string): string {
  const key = `${prefix}_${suffix}`;
  const value = process.env[key]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${key}`);
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

function loadProject(definition: ProjectDefinition): ProjectConfig {
  const prefix = definition.envPrefix;
  const apiKey = apiKeySchema.parse(required(prefix, 'API_KEY'));
  const fromEmail = emailSchema.parse(required(prefix, 'FROM_EMAIL'));
  const fromName = optional(prefix, 'FROM_NAME') ?? fromEmail;
  const replyToRaw = optional(prefix, 'REPLY_TO');
  const replyTo = replyToRaw ? emailSchema.parse(replyToRaw) : undefined;

  return {
    id: definition.id,
    apiKey,
    fromEmail,
    fromName,
    ...(replyTo ? { replyTo } : {}),
    allowedTemplates: definition.allowedTemplates,
  };
}

export function loadProjects(definitions: readonly ProjectDefinition[] = PROJECT_DEFINITIONS): ProjectConfig[] {
  const activeDefinitions = definitions.filter((definition) => definition.active);
  const projects: ProjectConfig[] = [];
  const errors: string[] = [];

  for (const definition of activeDefinitions) {
    try {
      projects.push(loadProject(definition));
    } catch (error) {
      errors.push(`${definition.id}: ${error instanceof Error ? error.message : 'invalid configuration'}`);
    }
  }

  if (errors.length > 0) {
    throw new Error(`Invalid project configuration:\n${errors.map((error) => `- ${error}`).join('\n')}`);
  }

  const ids = new Set(projects.map((project) => project.id));
  if (ids.size !== projects.length) throw new Error('Project IDs must be unique');

  const apiKeys = new Set(projects.map((project) => project.apiKey));
  if (apiKeys.size !== projects.length) throw new Error('Project API keys must be unique');

  return projects;
}
