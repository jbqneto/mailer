export enum SmtpProvider {
  PURELY_MAIL = 'PURELY_MAIL',
  MAILPIT = 'MAILPIT',
}

export interface SmtpCredentials {
  username: string;
  password: string;
}

export interface EmailAccount {
  id: string;
  name: string;
  email: string;
  provider: SmtpProvider;
  credentials: SmtpCredentials;
  active: boolean;
}
