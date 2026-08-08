/**
 * Non-secret project metadata.
 *
 * `envPrefix` maps the definition to environment variables such as:
 * PROJECT_A_API_KEY
 * PROJECT_A_SMTP_HOST
 * ...
 *
 * Replace these examples with your actual projects.
 */
export const PROJECT_DEFINITIONS = [
  {
    id: 'bloom-app',
    envPrefix: 'BLOOM_APP',
    allowedTemplates: [
      'shared-access-invitation',
      'shared-access-permission-updated',
      'shared-access-suspended',
      'shared-access-revoked',
    ],
  },
  {
    id: 'pontebr',
    envPrefix: 'PONTEBR',
    allowedTemplates: ['*'],
  },
  {
    id: 'blocos-e-bits',
    envPrefix: 'BLOCOS_E_BITS',
    allowedTemplates: ['*'],
  },
  {
    id: 'jbqneto',
    envPrefix: 'JBQNETO',
    allowedTemplates: ['*'],
  },
] as const;
