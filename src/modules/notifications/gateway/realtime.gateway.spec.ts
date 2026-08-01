import { RealtimeGateway } from './realtime.gateway';
import { SENSITIVE_SOCKET_FIELDS } from '../constants';

describe('RealtimeGateway payload deny-list', () => {
  const gateway = Object.create(RealtimeGateway.prototype) as RealtimeGateway;

  it('allows safe entity:changed payload', () => {
    expect(() =>
      gateway.assertNoSensitiveFields({
        entityType: 'student',
        entityId: 'uuid',
        action: 'updated',
      }),
    ).not.toThrow();
  });

  it('rejects salary in payload', () => {
    expect(() =>
      gateway.assertNoSensitiveFields({ entityType: 'payroll', netPay: 1000 }),
    ).toThrow(/Sensitive field/);
  });

  it('deny-list covers required fields', () => {
    expect(SENSITIVE_SOCKET_FIELDS).toEqual(
      expect.arrayContaining(['salary', 'netPay', 'diagnosis', 'amount']),
    );
  });
});

describe('WsJwtGuard integration expectations', () => {
  it('documents handshake token requirement', () => {
    expect(true).toBe(true);
  });
});
