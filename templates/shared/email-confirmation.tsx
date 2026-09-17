import { Html, Head, Preview, Body, Container, Section, Heading, Text, Button, Img } from 'react-email';

export interface GenericEmailProps {
  brand: string;
  logoUrl?: string | undefined;
  headerBackgroundColor?: string | undefined;
  footerBackgroundColor?: string | undefined;
  primaryColor?: string | undefined;
  headingColor?: string | undefined;
  textColor?: string | undefined;
  mutedTextColor?: string | undefined;
  fontFamily?: string | undefined;
  containerBackgroundColor?: string | undefined;
  title: string;
  mainText: string;
  buttonText?: string | undefined;
  buttonUrl?: string | undefined;
  footerText?: string | undefined;
  supportEmail?: string | undefined;
  supportUrl?: string | undefined;
  unsubscribeUrl?: string | undefined;
  code?: string | undefined;
  expiresIn?: string | undefined;
}

const defaultTheme = {
  headerBackgroundColor: '#111827',
  footerBackgroundColor: '#f9fafb',
  primaryColor: '#111827',
  headingColor: '#111827',
  textColor: '#374151',
  mutedTextColor: '#6b7280',
  fontFamily: 'Arial, Helvetica, sans-serif',
  containerBackgroundColor: '#ffffff',
};

export default function GenericEmailConfirmationEmail({
  brand,
  logoUrl,
  headerBackgroundColor = defaultTheme.headerBackgroundColor,
  footerBackgroundColor = defaultTheme.footerBackgroundColor,
  primaryColor = defaultTheme.primaryColor,
  headingColor = defaultTheme.headingColor,
  textColor = defaultTheme.textColor,
  mutedTextColor = defaultTheme.mutedTextColor,
  fontFamily = defaultTheme.fontFamily,
  containerBackgroundColor = defaultTheme.containerBackgroundColor,
  title,
  mainText,
  buttonText,
  buttonUrl,
  footerText,
  supportEmail,
  supportUrl,
  unsubscribeUrl,
  code,
  expiresIn,
}: GenericEmailProps) {
  return (
    <Html lang="pt-BR">
      <Head />
      <Preview>{title}</Preview>
      <Body style={{ backgroundColor: '#f6f7f9', fontFamily, margin: 0, padding: '32px 0' }}>
        <Container style={{ backgroundColor: containerBackgroundColor, borderRadius: '8px', margin: '0 auto', maxWidth: '560px' }}>
          <Section style={{ backgroundColor: headerBackgroundColor, borderRadius: '8px 8px 0 0', padding: '28px 32px', textAlign: 'center' }}>
            {logoUrl ? (
              <Img src={logoUrl} alt={brand} style={{ display: 'inline-block', marginBottom: '16px', maxWidth: '120px', height: 'auto' }} />
            ) : (
              <Text style={{ color: '#ffffff', fontSize: '24px', fontWeight: '700', margin: 0 }}>{brand}</Text>
            )}
          </Section>

          <Section style={{ padding: '32px' }}>
            <Heading style={{ color: headingColor, fontSize: '24px', lineHeight: '32px', margin: '0 0 16px' }}>{title}</Heading>
            <Text style={{ color: textColor, fontSize: '16px', lineHeight: '24px', margin: '0 0 16px' }}>{mainText}</Text>

            {code && (
              <Section style={{ backgroundColor: '#f6f7f9', borderRadius: '8px', margin: '24px 0', padding: '20px', textAlign: 'center' }}>
                <Text style={{ color: mutedTextColor, fontSize: '13px', margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: '1px' }}>Código de verificação</Text>
                <Text style={{ color: headingColor, fontSize: '32px', fontWeight: '700', letterSpacing: '8px', margin: 0, fontFamily: 'monospace' }}>{code}</Text>
              </Section>
            )}

            {buttonText && buttonUrl && (
              <Section style={{ margin: '28px 0 0', textAlign: 'center' }}>
                <Button href={buttonUrl} style={{ backgroundColor: primaryColor, borderRadius: '6px', color: '#ffffff', display: 'inline-block', fontSize: '15px', fontWeight: '700', padding: '13px 24px', textDecoration: 'none' }}>
                  {buttonText}
                </Button>
              </Section>
            )}

            {expiresIn && (
              <Text style={{ color: mutedTextColor, fontSize: '13px', lineHeight: '20px', marginTop: '16px', textAlign: 'center' }}>
                Este link expira em {expiresIn}.
              </Text>
            )}
          </Section>

          <Section style={{ backgroundColor: footerBackgroundColor, borderRadius: '0 0 8px 8px', borderTop: '1px solid #e5e7eb', padding: '24px 32px' }}>
            {footerText && (
              <Text style={{ color: mutedTextColor, fontSize: '13px', lineHeight: '20px', margin: '0 0 12px', textAlign: 'center' }}>
                {footerText}
              </Text>
            )}
            <Text style={{ color: mutedTextColor, fontSize: '12px', lineHeight: '18px', margin: 0, textAlign: 'center' }}>
              {supportEmail && <a href={`mailto:${supportEmail}`} style={{ color: mutedTextColor, textDecoration: 'underline' }}>{supportEmail}</a>}
              {supportEmail && supportUrl && ' · '}
              {supportUrl && <a href={supportUrl} style={{ color: mutedTextColor, textDecoration: 'underline' }}>Suporte</a>}
              {unsubscribeUrl && (supportEmail || supportUrl) && ' · '}
              {unsubscribeUrl && <a href={unsubscribeUrl} style={{ color: mutedTextColor, textDecoration: 'underline' }}>Cancelar inscrição</a>}
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

GenericEmailConfirmationEmail.PreviewProps = {
  brand: 'Minha App',
  logoUrl: 'https://example.com/logo.png',
  title: 'Confirme seu e-mail',
  mainText: 'Obrigado por se cadastrar! Para ativar sua conta, confirme seu endereço de e-mail clicando no botão abaixo ou use o código acima.',
  buttonText: 'Confirmar e-mail',
  buttonUrl: 'https://app.example.com/confirm?token=abc123',
  code: '123456',
  expiresIn: '24 horas',
  footerText: 'Se você não criou esta conta, pode ignorar este e-mail com segurança.',
  supportEmail: 'suporte@example.com',
  supportUrl: 'https://example.com/suporte',
  unsubscribeUrl: 'https://example.com/unsubscribe',
} satisfies GenericEmailProps;