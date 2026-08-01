export interface EmailSendInput {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export interface EmailSendResult {
  messageId?: string;
  accepted: boolean;
  bounced?: boolean;
  errorCode?: string;
  errorMessage?: string;
}

export interface EmailProvider {
  send(input: EmailSendInput): Promise<EmailSendResult>;
}
