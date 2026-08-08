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

export interface WelcomeUserEmailProps {
  name: string;
  actionUrl: string;
}

export default function WelcomeUserEmail({
  name,
  actionUrl,
}: WelcomeUserEmailProps) {
  return (
    <Html lang="pt-BR">
      <Head />
      <Preview>Bem-vindo. Sua conta está pronta.</Preview>
      <Body style={body}>
        <Container style={container}>
          <Heading style={heading}>Bem-vindo, {name}</Heading>
          <Text style={text}>
            Sua conta está pronta. Use o botão abaixo para continuar.
          </Text>
          <Section style={buttonSection}>
            <Button href={actionUrl} style={button}>
              Continuar
            </Button>
          </Section>
          <Text style={footer}>
            Se você não esperava este e-mail, pode ignorá-lo.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

WelcomeUserEmail.PreviewProps = {
  name: 'Neto',
  actionUrl: 'https://example.com/activate',
} satisfies WelcomeUserEmailProps;

const body = {
  backgroundColor: '#f6f7f9',
  fontFamily: 'Arial, Helvetica, sans-serif',
  margin: 0,
  padding: '32px 0',
};

const container = {
  backgroundColor: '#ffffff',
  borderRadius: '8px',
  margin: '0 auto',
  maxWidth: '560px',
  padding: '32px',
};

const heading = {
  color: '#111827',
  fontSize: '24px',
  margin: '0 0 16px',
};

const text = {
  color: '#374151',
  fontSize: '16px',
  lineHeight: '24px',
};

const buttonSection = {
  margin: '24px 0',
};

const button = {
  backgroundColor: '#111827',
  borderRadius: '6px',
  color: '#ffffff',
  display: 'inline-block',
  fontSize: '15px',
  padding: '12px 18px',
  textDecoration: 'none',
};

const footer = {
  color: '#6b7280',
  fontSize: '13px',
  lineHeight: '20px',
  marginTop: '32px',
};
