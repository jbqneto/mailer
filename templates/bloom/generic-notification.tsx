import { EmailCard, EmailHeading, EmailLayout, EmailText } from '../shared/components.js';

export interface GenericNotificationEmailProps {
  title: string;
  message: string;
}

export default function GenericNotificationEmail({ title, message }: GenericNotificationEmailProps) {
  return <EmailLayout preview={title}><EmailHeading>{title}</EmailHeading><EmailCard><EmailText>{message}</EmailText></EmailCard></EmailLayout>;
}

GenericNotificationEmail.PreviewProps = { title: 'Atualização disponível', message: 'Este é um exemplo de notificação transacional.' } satisfies GenericNotificationEmailProps;
