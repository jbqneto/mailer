import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from 'react-email';

export interface SharedAccessInvitationEmailProps {
  recipientName: string;
  ownerName: string;
  permissionLabel: string;
  actionUrl: string;
  expiresAt: string;
}

export interface SharedAccessPermissionUpdatedEmailProps {
  recipientName: string;
  ownerName: string;
  permissionLabel: string;
  actionUrl: string;
}

export interface SharedAccessSuspendedEmailProps {
  recipientName: string;
  ownerName: string;
  actionUrl: string;
}

export interface SharedAccessRevokedEmailProps {
  recipientName: string;
  ownerName: string;
  actionUrl: string;
}

export function SharedAccessInvitationEmail({
  recipientName,
  ownerName,
  permissionLabel,
  actionUrl,
  expiresAt,
}: SharedAccessInvitationEmailProps) {
  return (
    <BloomLayout preview={`${ownerName} compartilhou o acesso ao Bloom com você.`}>
      <Heading style={heading}>Você recebeu um convite do Bloom</Heading>
      <Text style={text}>Olá, {recipientName}.</Text>
      <Text style={text}>
        {ownerName} convidou você para acompanhar dados do ciclo no Bloom com permissão de {permissionLabel}.
      </Text>
      <Section style={buttonSection}>
        <Button href={actionUrl} style={button}>Aceitar convite</Button>
      </Section>
      <Text style={muted}>Este convite expira em {expiresAt}.</Text>
      <Text style={footer}>Se você não esperava este convite, ignore este e-mail.</Text>
    </BloomLayout>
  );
}

export function SharedAccessPermissionUpdatedEmail({
  recipientName,
  ownerName,
  permissionLabel,
  actionUrl,
}: SharedAccessPermissionUpdatedEmailProps) {
  return (
    <BloomLayout preview={`A permissão do seu acesso ao Bloom foi atualizada.`}>
      <Heading style={heading}>Permissão atualizada</Heading>
      <Text style={text}>Olá, {recipientName}.</Text>
      <Text style={text}>
        {ownerName} atualizou sua permissão de acesso no Bloom para {permissionLabel}.
      </Text>
      <Section style={buttonSection}>
        <Button href={actionUrl} style={button}>Abrir acesso compartilhado</Button>
      </Section>
      <Text style={footer}>Se você não esperava esta alteração, entre em contato com {ownerName}.</Text>
    </BloomLayout>
  );
}

export function SharedAccessSuspendedEmail({
  recipientName,
  ownerName,
  actionUrl,
}: SharedAccessSuspendedEmailProps) {
  return (
    <BloomLayout preview="Seu acesso compartilhado ao Bloom foi suspenso.">
      <Heading style={heading}>Acesso temporariamente suspenso</Heading>
      <Text style={text}>Olá, {recipientName}.</Text>
      <Text style={text}>
        {ownerName} suspendeu temporariamente seu acesso aos dados compartilhados no Bloom.
      </Text>
      <Section style={buttonSection}>
        <Button href={actionUrl} style={button}>Ver status do acesso</Button>
      </Section>
      <Text style={footer}>O acesso poderá ser reativado pela proprietária da conta.</Text>
    </BloomLayout>
  );
}

export function SharedAccessRevokedEmail({
  recipientName,
  ownerName,
  actionUrl,
}: SharedAccessRevokedEmailProps) {
  return (
    <BloomLayout preview="Seu acesso compartilhado ao Bloom foi removido.">
      <Heading style={heading}>Acesso removido</Heading>
      <Text style={text}>Olá, {recipientName}.</Text>
      <Text style={text}>
        {ownerName} removeu seu acesso aos dados compartilhados no Bloom.
      </Text>
      <Section style={buttonSection}>
        <Button href={actionUrl} style={button}>Abrir o Bloom</Button>
      </Section>
      <Text style={footer}>Se você acredita que isso aconteceu por engano, entre em contato com {ownerName}.</Text>
    </BloomLayout>
  );
}

function BloomLayout({ children, preview }: { children: React.ReactNode; preview: string }) {
  return (
    <Html lang="pt-BR">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={body}>
        <Container style={container}>
          <Text style={brand}>BLOOM</Text>
          {children}
        </Container>
      </Body>
    </Html>
  );
}

const body = {
  backgroundColor: '#f7f5f2',
  fontFamily: 'Arial, Helvetica, sans-serif',
  margin: 0,
  padding: '32px 0',
};

const container = {
  backgroundColor: '#ffffff',
  borderRadius: '24px',
  margin: '0 auto',
  maxWidth: '560px',
  padding: '32px',
};

const brand = {
  color: '#b95f72',
  fontSize: '12px',
  fontWeight: '700',
  letterSpacing: '3px',
  margin: '0 0 28px',
};

const heading = {
  color: '#332d2d',
  fontSize: '25px',
  lineHeight: '32px',
  margin: '0 0 18px',
};

const text = {
  color: '#544b4b',
  fontSize: '16px',
  lineHeight: '25px',
};

const buttonSection = { margin: '28px 0' };

const button = {
  backgroundColor: '#b95f72',
  borderRadius: '999px',
  color: '#ffffff',
  display: 'inline-block',
  fontSize: '15px',
  fontWeight: '700',
  padding: '13px 20px',
  textDecoration: 'none',
};

const muted = {
  color: '#8a7f7f',
  fontSize: '13px',
  lineHeight: '20px',
};

const footer = {
  color: '#8a7f7f',
  fontSize: '13px',
  lineHeight: '20px',
  marginTop: '28px',
};
