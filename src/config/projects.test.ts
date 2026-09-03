import { afterEach, describe, expect, it } from 'vitest';
import { loadProjects } from './projects.js';
import type { ProjectDefinition } from './project-definitions.js';

const envKeys = ['ACTIVE_API_KEY', 'ACTIVE_FROM_EMAIL', 'ACTIVE_FROM_NAME', 'ACTIVE_REPLY_TO'];
const originalEnv = new Map(envKeys.map((key) => [key, process.env[key]]));

afterEach(() => {
  for (const key of envKeys) {
    const original = originalEnv.get(key);
    if (original === undefined) delete process.env[key];
    else process.env[key] = original;
  }
});

const inactiveProject: ProjectDefinition = {
  id: 'future-project',
  envPrefix: 'FUTURE_PROJECT',
  active: false,
  allowedTemplates: ['*'],
};

const activeProject: ProjectDefinition = {
  id: 'active-project',
  envPrefix: 'ACTIVE',
  active: true,
  allowedTemplates: ['*'],
};

function configureActiveProject(): void {
  process.env.ACTIVE_API_KEY = 'a'.repeat(32);
  process.env.ACTIVE_FROM_EMAIL = 'sender@example.com';
}

describe('loadProjects', () => {
  it('ignores missing environment variables for inactive projects', () => {
    configureActiveProject();
    const projects = loadProjects([inactiveProject, activeProject]);
    expect(projects).toHaveLength(1);
    expect(projects[0]?.id).toBe('active-project');
  });

  it('uses FROM_EMAIL as the default FROM_NAME', () => {
    configureActiveProject();
    const [project] = loadProjects([activeProject]);
    expect(project?.fromName).toBe('sender@example.com');
    expect(project?.replyTo).toBeUndefined();
  });

  it('still rejects an active project with missing required configuration', () => {
    expect(() => loadProjects([activeProject])).toThrow(
      'active-project: Missing required environment variable: ACTIVE_API_KEY',
    );
  });
});
