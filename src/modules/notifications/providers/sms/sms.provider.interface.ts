export interface SmsSendInput {
  to: string;
  body: string;
}

export interface SmsSendResult {
  messageId?: string;
  accepted: boolean;
  invalidNumber?: boolean;
  errorCode?: string;
  errorMessage?: string;
  costUnits?: number;
}

export interface SmsProvider {
  send(input: SmsSendInput): Promise<SmsSendResult>;
  pollDelivery?(messageId: string): Promise<'delivered' | 'failed' | 'pending'>;
}
