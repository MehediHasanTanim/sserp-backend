import { scrubSensitive } from './sensitive-fields.serializer';

describe('scrubSensitive', () => {
  it('redacts sensitive fields', () => {
    const out = scrubSensitive({
      password: 'secret',
      nested: { refreshToken: 'abc', ok: 1 },
    }) as Record<string, unknown>;
    expect(out.password).toBe('[REDACTED]');
    expect((out.nested as Record<string, unknown>).refreshToken).toBe(
      '[REDACTED]',
    );
    expect((out.nested as Record<string, unknown>).ok).toBe(1);
  });
});
