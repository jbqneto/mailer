import type { ReactNode } from 'react';
import {
  Body,
  Container,
  Head,
  Html,
  Preview,
  Section,
  Text,
} from 'react-email';

export interface BaseEmailProps {
  preview: string;
  children: ReactNode;
  header?: ReactNode;
  footer?: ReactNode;
  lang?: string;
}

/**
 * Shared structural shell for project email templates.
 *
 * Project-specific templates should provide only their content through
 * `children`, while the header/footer can be customized when necessary.
 */
export default function BaseEmail({
  preview,
  children,
  header,
  footer,
  lang = 'pt-BR',
}: BaseEmailProps) {
  return (
    <Html lang={lang}>
      <Head />
      <Preview>{preview}</Preview>
      <Body style={body}>
        <Container style={container}>
          <Section style={headerSection}>
            {header ?? <Text style={defaultHeader}>MAILER</Text>}
          </Section>

          <Section style={mainSection}>{children}</Section>

          <Section style={footerSection}>
            {footer ?? (
              <Text style={defaultFooter}>
                Este é um e-mail automático. Por favor, não responda diretamente a esta mensagem.
              </Text>
            )}
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

const body = {
  backgroundColor: '#f6f7f9',
  fontFamily: 'Arial, Helvetica, sans-serif',
  margin: 0,
  padding: '32px 0',
};

const container = {
  backgroundColor: '#ffffff',
  margin: '0 auto',
  maxWidth: '560px',
  width: '100%',
};

const headerSection = {
  padding: '28px 32px 12px',
};

const mainSection = {
  padding: '12px 32px 28px',
};

const footerSection = {
  borderTop: '1px solid #e5e7eb',
  padding: '20px 32px 28px',
};

const defaultHeader = {
  color: '#111827',
  fontSize: '13px',
  fontWeight: '700',
  letterSpacing: '2px',
  margin: 0,
};

const defaultFooter = {
  color: '#6b7280',
  fontSize: '12px',
  lineHeight: '18px',
  margin: 0,
};
