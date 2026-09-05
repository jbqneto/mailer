import type { ReactNode } from 'react';
import { Body, Button, Container, Head, Heading, Html, Preview, Section, Text } from 'react-email';
import { defaultEmailTheme } from './default-theme.js';
import type { EmailTheme } from './email-theme.js';

interface ThemedContentProps { children: ReactNode; theme?: EmailTheme; }
export interface EmailLayoutProps { preview: string; children: ReactNode; theme?: EmailTheme; brand?: string; }

export function EmailLayout({ preview, children, theme = defaultEmailTheme, brand }: EmailLayoutProps) {
  return (
    <Html lang="pt-BR">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={{ backgroundColor: theme.backgroundColor, fontFamily: theme.fontFamily, margin: 0, padding: '32px 0' }}>
        <Container style={{ backgroundColor: theme.surfaceColor, borderRadius: theme.containerRadius, margin: '0 auto', maxWidth: '560px', padding: '32px' }}>
          {brand ? <Text style={{ color: theme.primaryColor, fontSize: '12px', fontWeight: '700', letterSpacing: '3px', margin: '0 0 28px' }}>{brand}</Text> : null}
          {children}
        </Container>
      </Body>
    </Html>
  );
}

export function EmailHeading({ children, theme = defaultEmailTheme }: ThemedContentProps) { return <Heading style={{ color: theme.headingColor, fontSize: '24px', lineHeight: '32px', margin: '0 0 16px' }}>{children}</Heading>; }
export function EmailText({ children, theme = defaultEmailTheme }: ThemedContentProps) { return <Text style={{ color: theme.textColor, fontSize: '16px', lineHeight: '24px' }}>{children}</Text>; }
export function EmailMuted({ children, theme = defaultEmailTheme }: ThemedContentProps) { return <Text style={{ color: theme.mutedTextColor, fontSize: '13px', lineHeight: '20px' }}>{children}</Text>; }
export function EmailFooter({ children, theme = defaultEmailTheme }: ThemedContentProps) { return <Text style={{ color: theme.mutedTextColor, fontSize: '13px', lineHeight: '20px', marginTop: '28px' }}>{children}</Text>; }
export function EmailButton({ children, href, theme = defaultEmailTheme }: ThemedContentProps & { href: string }) { return <Section style={{ margin: '24px 0' }}><Button href={href} style={{ backgroundColor: theme.primaryColor, borderRadius: theme.buttonRadius, color: theme.buttonTextColor, display: 'inline-block', fontSize: '15px', fontWeight: '700', padding: '13px 20px', textDecoration: 'none' }}>{children}</Button></Section>; }
export function EmailLink({ children, href, theme = defaultEmailTheme }: ThemedContentProps & { href: string }) { return <a href={href} style={{ color: theme.primaryColor, textDecoration: 'underline' }}>{children}</a>; }
export function EmailFallbackLink({ href, theme = defaultEmailTheme }: { href: string; theme?: EmailTheme }) { return <EmailMuted theme={theme}>Se o botão não funcionar, copie este endereço:<br /><EmailLink href={href} theme={theme}>{href}</EmailLink></EmailMuted>; }
export function EmailCard({ children, theme = defaultEmailTheme }: ThemedContentProps) { return <Section style={{ backgroundColor: theme.backgroundColor, borderRadius: '12px', margin: '24px 0', padding: '16px' }}>{children}</Section>; }
export function EmailAlert({ children, theme = defaultEmailTheme }: ThemedContentProps) { return <Section style={{ backgroundColor: theme.backgroundColor, borderLeft: `4px solid ${theme.primaryColor}`, margin: '24px 0', padding: '12px 16px' }}><EmailMuted theme={theme}>{children}</EmailMuted></Section>; }
