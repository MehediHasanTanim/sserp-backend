/**
 * WS rooms coverage — alias suite for plan naming (ws-rooms).
 */
import { RoomResolverService } from '../../src/modules/notifications/gateway/room-resolver.service';
import { AuthUser } from '../../src/shared/decorators';

describe('WS rooms (WS-02)', () => {
  const rooms = new RoomResolverService();

  it('staff joins user + role rooms only', () => {
    const result = rooms.roomsForUser({
      id: 'c1',
      roles: ['coordinator'],
    } as AuthUser);
    expect(result).toEqual(['user:c1', 'role:coordinator']);
  });

  it('thread room naming', () => {
    expect(rooms.threadRoom('t1')).toBe('thread:t1');
  });
});
