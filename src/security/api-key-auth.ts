import { timingSafeEqual } from 'node:crypto';
import type { ProjectConfig } from '../domain/project.js';

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

export function resolveProjectFromAuthorization(
  authorization: string | undefined,
  projects: readonly ProjectConfig[],
): ProjectConfig | undefined {
  if (!authorization?.startsWith('Bearer ')) {
    return undefined;
  }

  const token = authorization.slice('Bearer '.length).trim();
  if (!token) {
    return undefined;
  }

  return projects.find((project) => safeEqual(project.apiKey, token));
}
