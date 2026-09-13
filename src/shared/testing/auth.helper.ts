import { JwtService } from '@nestjs/jwt';
import { readFileSync } from 'fs';

const ROLES = [
  'super_admin',
  'principal',
  'coordinator',
  'teacher',
  'therapist',
  'hr_officer',
  'accountant',
  'receptionist',
  'parent',
] as const;

/** Issue a valid RS256 access token for tests without going through /auth/login. */
export async function issueTestToken(params: {
  userId: string;
  role: (typeof ROLES)[number];
  permissions?: string[];
  privateKeyPath?: string;
  scope?: { studentIds: string[]; guardianProfileId: string };
}): Promise<string> {
  const privateKey = readFileSync(
    params.privateKeyPath ??
      process.env.JWT_PRIVATE_KEY_PATH ??
      './keys/jwt-private.pem',
    'utf8',
  );
  const jwt = new JwtService();
  return jwt.signAsync(
    {
      sub: params.userId,
      username: params.role,
      email: `${params.role}@test.local`,
      roles: [params.role],
      permissions: params.permissions ?? [],
      mustChangePassword: false,
      jti: `test-${params.role}-${params.userId.slice(0, 8)}`,
      ...(params.scope ? { scope: params.scope } : {}),
    },
    { privateKey, algorithm: 'RS256', expiresIn: '15m' },
  );
}

export { ROLES };
