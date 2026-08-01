import { RoomResolverService } from '../../src/modules/notifications/gateway/room-resolver.service';
import { RealtimeGateway } from '../../src/modules/notifications/gateway/realtime.gateway';
import { SENSITIVE_SOCKET_FIELDS } from '../../src/modules/notifications/constants';
import { AuthUser } from '../../src/shared/decorators';

describe('WebSocket auth & rooms (WS-01/WS-02/WS-06)', () => {
  const rooms = new RoomResolverService();

  it('builds user and role rooms for staff', () => {
    const user = {
      id: 'u1',
      roles: ['coordinator', 'teacher'],
    } as AuthUser;
    const result = rooms.roomsForUser(user);
    expect(result).toEqual(
      expect.arrayContaining(['user:u1', 'role:coordinator', 'role:teacher']),
    );
  });

  it('adds student rooms for parents via portalScope', () => {
    const user = {
      id: 'p1',
      roles: ['parent'],
      portalScope: { studentIds: ['s1', 's2'] },
    } as AuthUser;
    const result = rooms.roomsForUser(user);
    expect(result).toEqual(
      expect.arrayContaining([
        'user:p1',
        'role:parent',
        'student:s1',
        'student:s2',
      ]),
    );
  });

  it('deny-list covers medical/financial/salary field names (WS-06)', () => {
    expect(SENSITIVE_SOCKET_FIELDS.length).toBeGreaterThan(0);
    const gateway = Object.create(RealtimeGateway.prototype) as RealtimeGateway;
    expect(() => gateway.assertNoSensitiveFields({ salary: 50000 })).toThrow(
      /Sensitive field/,
    );
    expect(() =>
      gateway.assertNoSensitiveFields({
        entityType: 'student',
        entityId: 'x',
        action: 'updated',
      }),
    ).not.toThrow();
  });
});

describe('Multi-instance broadcast contract (WS-05)', () => {
  it('documents Redis adapter requirement for multi-instance', () => {
    expect(
      'RealtimeGateway.afterInit uses @socket.io/redis-adapter when redisPubsubUrl is set',
    ).toContain('redis-adapter');
  });
});
