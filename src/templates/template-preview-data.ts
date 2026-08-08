export interface TemplatePreviewDefinition {
  label: string;
  data: Record<string, unknown>;
}

/**
 * Central catalog of sample payloads used by the visual preview workspace.
 *
 * When a template is added to the registry, add its representative preview
 * payload here as well. The preview page is generated from this export.
 */
export const TEMPLATE_PREVIEW_DATA = {
  'welcome-user': {
    label: 'welcome-user',
    data: {
      name: 'Neto',
      actionUrl: 'https://example.com/activate',
    },
  },
  'generic-notification': {
    label: 'generic-notification',
    data: {
      title: 'Atualização disponível',
      message: 'Este é um teste.',
    },
  },
  'shared-access-invitation': {
    label: 'shared-access-invitation',
    data: {
      recipientName: 'Neto',
      ownerName: 'Ana',
      permissionLabel: 'Editor',
      actionUrl: 'https://example.com/shared-access/accept',
      expiresAt: '31/12/2026',
    },
  },
  'shared-access-permission-updated': {
    label: 'shared-access-permission-updated',
    data: {
      recipientName: 'Neto',
      ownerName: 'Ana',
      permissionLabel: 'Visualizador',
      actionUrl: 'https://example.com/shared-access',
    },
  },
  'shared-access-suspended': {
    label: 'shared-access-suspended',
    data: {
      recipientName: 'Neto',
      ownerName: 'Ana',
      actionUrl: 'https://example.com/shared-access',
    },
  },
  'shared-access-revoked': {
    label: 'shared-access-revoked',
    data: {
      recipientName: 'Neto',
      ownerName: 'Ana',
      actionUrl: 'https://example.com/shared-access',
    },
  },
} as const satisfies Record<string, TemplatePreviewDefinition>;

export type TemplatePreviewName = keyof typeof TEMPLATE_PREVIEW_DATA;

export function listTemplatePreviews(): Array<
  TemplatePreviewDefinition & { name: TemplatePreviewName }
> {
  return Object.entries(TEMPLATE_PREVIEW_DATA).map(([name, definition]) => ({
    name: name as TemplatePreviewName,
    ...definition,
  }));
}
