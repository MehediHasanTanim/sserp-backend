/**
 * Multi-instance broadcast — Redis adapter contract (WS-05).
 */
import { readFileSync } from 'fs';
import { join } from 'path';

describe('Multi-instance WebSocket broadcast (WS-05)', () => {
  it('RealtimeGateway configures @socket.io/redis-adapter', () => {
    const src = readFileSync(
      join(
        __dirname,
        '../../src/modules/notifications/gateway/realtime.gateway.ts',
      ),
      'utf8',
    );
    expect(src).toContain('@socket.io/redis-adapter');
    expect(src).toContain('createAdapter');
    expect(src).toContain('redisPubsubUrl');
  });
});
