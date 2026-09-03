export type EmailDeliveryStatus = 'processing' | 'accepted' | 'failed';

export interface EmailDelivery {
  id: string;
  projectId: string;
  emailAccountId: string;
  template: string;
  to: string[];
  subject: string;
  status: EmailDeliveryStatus;
  createdAt: string;
  acceptedAt?: string;
  failedAt?: string;
  providerMessageId?: string;
  errorCode?: string;
  idempotencyKey?: string;
  payloadHash?: string;
}

export interface EmailDeliveryFilter {
  projectId?: string;
  status?: EmailDeliveryStatus;
  limit?: number;
}

export type EmailDeliveryReservation =
  | { kind: 'reserved'; delivery: EmailDelivery }
  | { kind: 'existing'; delivery: EmailDelivery };

export interface EmailDeliveryStore {
  reserve(delivery: EmailDelivery): Promise<EmailDeliveryReservation>;
  update(id: string, patch: Partial<Pick<EmailDelivery, 'status' | 'acceptedAt' | 'failedAt' | 'providerMessageId' | 'errorCode'>>): Promise<EmailDelivery>;
  releaseIdempotency(projectId: string, idempotencyKey: string, deliveryId: string): Promise<void>;
  getById(id: string): Promise<EmailDelivery | undefined>;
  list(filter?: EmailDeliveryFilter): Promise<EmailDelivery[]>;
}
