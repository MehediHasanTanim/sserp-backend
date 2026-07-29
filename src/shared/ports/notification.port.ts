export interface NotifyInput {
  userId: string;
  type: string;
  title: string;
  body: string;
  entityType?: string;
  entityId?: string;
  channels?: string[];
}

export abstract class NotificationPort {
  abstract notify(input: NotifyInput): Promise<void>;
}
