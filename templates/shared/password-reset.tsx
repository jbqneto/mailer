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
  expiresIn?: string | undefined;
  requestedIp?: string | undefined;
  requestedLocation?: string | undefined;
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

export default function GenericPasswordResetEmail({
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
  expiresIn,
  requestedIp,
  requestedLocation,
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

            {(requestedIp || requestedLocation) && (
              <Section style={{ marginTop: '24px', padding: '16px', backgroundColor: '#fef3e2', borderRadius: '8px', border: '1px solid #fde68a' }}>
                <Text style={{ color: '#b45309', fontSize: '13px', lineHeight: '20px', margin: 0, fontWeight: '600' }}>Detalhes da solicitação:</Text>
                <Text style={{ color: '#b45309', fontSize: '12px', lineHeight: '18px', margin: '8px 0 0' }}>
                  {requestedIp && <><strong>IP: </strong>{requestedIp}{requestedLocation && <br />}</>}
                  {requestedLocation && <>Localização aproximada: {requestedLocation}</>}
                </Text>
              </Section>
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

GenericPasswordResetEmail.PreviewProps = {
  brand: 'Minha App',
  logoUrl: 'https://example.com/logo.png',
  title: 'Redefinir sua senha',
  mainText: 'Recebemos uma solicitação para redefinir a senha da sua conta. Se foi você, clique no botão abaixo para criar uma nova senha.',
  buttonText: 'Redefinir senha',
  buttonUrl: 'https://app.example.com/reset-password?token=abc123',
  expiresIn: '1 hora',
  requestedIp: '192.168.1.1',
  requestedLocation: 'São Paulo, Brasil',
  footerText: 'Se você não solicitou isso, ignore este e-mail. Sua senha permanecerá inalterada.',
  supportEmail: 'suporte@example.com',
  supportUrl: 'https://example.com/suporte',
  unsubscribeUrl: 'https://example.com/unsubscribe',
} satisfies GenericEmailProps;