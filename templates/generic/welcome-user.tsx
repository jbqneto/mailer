import { EmailButton, EmailFallbackLink, EmailFooter, EmailHeading, EmailLayout, EmailText } from '../shared/components.js';

export interface WelcomeUserEmailProps { name: string; actionUrl: string; }

export default function WelcomeUserEmail({ name, actionUrl }: WelcomeUserEmailProps) {
  return <EmailLayout preview="Bem-vindo. Sua conta está pronta."><EmailHeading>Bem-vindo, {name}</EmailHeading><EmailText>Sua conta está pronta. Use o botão abaixo para continuar.</EmailText><EmailButton href={actionUrl}>Continuar</EmailButton><EmailFallbackLink href={actionUrl} /><EmailFooter>Se você não esperava este e-mail, pode ignorá-lo.</EmailFooter></EmailLayout>;
}

WelcomeUserEmail.PreviewProps = { name: 'Neto', actionUrl: 'https://example.com/activate' } satisfies WelcomeUserEmailProps;
