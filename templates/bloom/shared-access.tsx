import {
  EmailAlert,
  EmailButton,
  EmailFallbackLink,
  EmailFooter,
  EmailHeading,
  EmailLayout,
  EmailText,
} from '../shared/components.js';
import { bloomEmailTheme } from '../themes/bloom.js';

export interface SharedAccessInvitationEmailProps { recipientName: string; ownerName: string; permissionLabel: string; actionUrl: string; expiresAt: string; }
export interface SharedAccessPermissionUpdatedEmailProps { recipientName: string; ownerName: string; permissionLabel: string; actionUrl: string; }
export interface SharedAccessSuspendedEmailProps { recipientName: string; ownerName: string; actionUrl: string; }
export interface SharedAccessRevokedEmailProps { recipientName: string; ownerName: string; actionUrl: string; }

export function SharedAccessInvitationEmail({ recipientName, ownerName, permissionLabel, actionUrl, expiresAt }: SharedAccessInvitationEmailProps) {
  return <EmailLayout preview={`${ownerName} compartilhou o acesso ao Bloom com você.`} theme={bloomEmailTheme} brand="BLOOM"><EmailHeading theme={bloomEmailTheme}>Você recebeu um convite do Bloom</EmailHeading><EmailText theme={bloomEmailTheme}>Olá, {recipientName}.</EmailText><EmailText theme={bloomEmailTheme}>{ownerName} convidou você para acompanhar dados do ciclo no Bloom com permissão de {permissionLabel}.</EmailText><EmailButton href={actionUrl} theme={bloomEmailTheme}>Aceitar convite</EmailButton><EmailFallbackLink href={actionUrl} theme={bloomEmailTheme} /><EmailAlert theme={bloomEmailTheme}>Este convite expira em {expiresAt}.</EmailAlert><EmailFooter theme={bloomEmailTheme}>Se você não esperava este convite, ignore este e-mail.</EmailFooter></EmailLayout>;
}

export function SharedAccessPermissionUpdatedEmail({ recipientName, ownerName, permissionLabel, actionUrl }: SharedAccessPermissionUpdatedEmailProps) {
  return <EmailLayout preview="A permissão do seu acesso ao Bloom foi atualizada." theme={bloomEmailTheme} brand="BLOOM"><EmailHeading theme={bloomEmailTheme}>Permissão atualizada</EmailHeading><EmailText theme={bloomEmailTheme}>Olá, {recipientName}.</EmailText><EmailText theme={bloomEmailTheme}>{ownerName} atualizou sua permissão de acesso no Bloom para {permissionLabel}.</EmailText><EmailButton href={actionUrl} theme={bloomEmailTheme}>Abrir acesso compartilhado</EmailButton><EmailFallbackLink href={actionUrl} theme={bloomEmailTheme} /><EmailFooter theme={bloomEmailTheme}>Se você não esperava esta alteração, entre em contato com {ownerName}.</EmailFooter></EmailLayout>;
}

export function SharedAccessSuspendedEmail({ recipientName, ownerName, actionUrl }: SharedAccessSuspendedEmailProps) {
  return <EmailLayout preview="Seu acesso compartilhado ao Bloom foi suspenso." theme={bloomEmailTheme} brand="BLOOM"><EmailHeading theme={bloomEmailTheme}>Acesso temporariamente suspenso</EmailHeading><EmailText theme={bloomEmailTheme}>Olá, {recipientName}.</EmailText><EmailText theme={bloomEmailTheme}>{ownerName} suspendeu temporariamente seu acesso aos dados compartilhados no Bloom.</EmailText><EmailButton href={actionUrl} theme={bloomEmailTheme}>Ver status do acesso</EmailButton><EmailFallbackLink href={actionUrl} theme={bloomEmailTheme} /><EmailFooter theme={bloomEmailTheme}>O acesso poderá ser reativado pela proprietária da conta.</EmailFooter></EmailLayout>;
}

export function SharedAccessRevokedEmail({ recipientName, ownerName, actionUrl }: SharedAccessRevokedEmailProps) {
  return <EmailLayout preview="Seu acesso compartilhado ao Bloom foi removido." theme={bloomEmailTheme} brand="BLOOM"><EmailHeading theme={bloomEmailTheme}>Acesso removido</EmailHeading><EmailText theme={bloomEmailTheme}>Olá, {recipientName}.</EmailText><EmailText theme={bloomEmailTheme}>{ownerName} removeu seu acesso aos dados compartilhados no Bloom.</EmailText><EmailButton href={actionUrl} theme={bloomEmailTheme}>Abrir o Bloom</EmailButton><EmailFallbackLink href={actionUrl} theme={bloomEmailTheme} /><EmailFooter theme={bloomEmailTheme}>Se você acredita que isso aconteceu por engano, entre em contato com {ownerName}.</EmailFooter></EmailLayout>;
}
