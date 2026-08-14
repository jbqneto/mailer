import { readFileSync } from "node:fs";
import { z } from "zod";

export interface ProjectDefinition {
  id: string;
  envPrefix: string;
  active: boolean;
  allowedTemplates: readonly string[];
}

const projectDefinitionSchema = z.object({
  id: z.string().min(1),
  envPrefix: z.string().regex(/^[A-Z0-9_]+$/),
  active: z.boolean(),
  allowedTemplates: z.array(z.string().min(1)).min(1),
}).strict();

const projectsFileSchema = z.object({
  projects: z.array(projectDefinitionSchema),
}).strict();

const parsed = projectsFileSchema.parse(
  JSON.parse(readFileSync(new URL("./projects.json", import.meta.url), "utf8")),
);

export const PROJECT_DEFINITIONS: readonly ProjectDefinition[] = parsed.projects;
