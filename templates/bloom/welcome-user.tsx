import { EmailButton, EmailFallbackLink, EmailFooter, EmailHeading, EmailLayout, EmailText } from '../shared/components.js';
import { bloomEmailTheme } from '../themes/bloom.js';

export interface WelcomeUserEmailProps {
  name: string;
  actionUrl: string;
}

export default function WelcomeUserEmail({ name, actionUrl }: WelcomeUserEmailProps) {
  return <EmailLayout preview="Bem-vindo. Sua conta está pronta." theme={bloomEmailTheme} brand="BLOOM"><EmailHeading theme={bloomEmailTheme}>Bem-vindo, {name}</EmailHeading><EmailText theme={bloomEmailTheme}>Sua conta está pronta. Use o botão abaixo para continuar.</EmailText><EmailButton href={actionUrl} theme={bloomEmailTheme}>Continuar</EmailButton><EmailFallbackLink href={actionUrl} theme={bloomEmailTheme} /><EmailFooter theme={bloomEmailTheme}>Se você não esperava este e-mail, pode ignorá-lo.</EmailFooter></EmailLayout>;
}

WelcomeUserEmail.PreviewProps = { name: 'Neto', actionUrl: 'https://example.com/activate' } satisfies WelcomeUserEmailProps;
