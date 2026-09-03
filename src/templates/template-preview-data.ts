export interface TemplatePreviewDefinition {
  group: string;
  label: string;
  description: string;
  data: Record<string, unknown>;
}

/** Authoring catalog for the visual preview workspace. Runtime requests still provide JSON. */
export const TEMPLATE_PREVIEW_DATA = {
  'welcome-user': { group: 'Geral', label: 'welcome-user', description: 'Mensagem de boas-vindas para uma conta recém-criada.', data: { name: 'Neto', actionUrl: 'https://example.com/activate' } },
  'generic-notification': { group: 'Geral', label: 'generic-notification', description: 'Notificação transacional simples com título e mensagem.', data: { title: 'Atualização disponível', message: 'Este é um teste.' } },
  'shared-access-invitation': { group: 'Bloom', label: 'shared-access-invitation', description: 'Convite para acompanhar dados compartilhados no Bloom.', data: { recipientName: 'Neto', ownerName: 'Ana', permissionLabel: 'Editor', actionUrl: 'https://example.com/shared-access/accept', expiresAt: '31/12/2026' } },
  'shared-access-permission-updated': { group: 'Bloom', label: 'shared-access-permission-updated', description: 'Atualização da permissão de um acesso compartilhado.', data: { recipientName: 'Neto', ownerName: 'Ana', permissionLabel: 'Visualizador', actionUrl: 'https://example.com/shared-access' } },
  'shared-access-suspended': { group: 'Bloom', label: 'shared-access-suspended', description: 'Aviso de suspensão temporária de acesso.', data: { recipientName: 'Neto', ownerName: 'Ana', actionUrl: 'https://example.com/shared-access' } },
  'shared-access-revoked': { group: 'Bloom', label: 'shared-access-revoked', description: 'Aviso de remoção de acesso compartilhado.', data: { recipientName: 'Neto', ownerName: 'Ana', actionUrl: 'https://example.com/shared-access' } },
} as const satisfies Record<string, TemplatePreviewDefinition>;

export type TemplatePreviewName = keyof typeof TEMPLATE_PREVIEW_DATA;

export function listTemplatePreviews(): Array<TemplatePreviewDefinition & { name: TemplatePreviewName }> {
  return Object.entries(TEMPLATE_PREVIEW_DATA).map(([name, definition]) => ({ name: name as TemplatePreviewName, ...definition }));
}
