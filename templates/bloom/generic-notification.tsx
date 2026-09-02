import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Text,
} from 'react-email';

export interface GenericNotificationEmailProps {
  title: string;
  message: string;
}

export default function GenericNotificationEmail({
  title,
  message,
}: GenericNotificationEmailProps) {
  return (
    <Html lang="pt-BR">
      <Head />
      <Preview>{title}</Preview>
      <Body style={body}>
        <Container style={container}>
          <Heading style={heading}>{title}</Heading>
          <Text style={text}>{message}</Text>
        </Container>
      </Body>
    </Html>
  );
}

GenericNotificationEmail.PreviewProps = {
  title: 'Atualização disponível',
  message: 'Este é um exemplo de notificação transacional.',
} satisfies GenericNotificationEmailProps;

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
  fontSize: '22px',
  margin: '0 0 16px',
};

const text = {
  color: '#374151',
  fontSize: '16px',
  lineHeight: '24px',
};
