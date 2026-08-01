const SENSITIVE = [
  'password',
  'passwordHash',
  'password_hash',
  'token',
  'refreshToken',
  'accessToken',
  'authorization',
  'twoFactorSecret',
  'two_factor_secret',
  'twoFactorRecoveryCodes',
  'nationalId',
  'national_id',
  'basicSalary',
  'basic_salary',
  'bankDetails',
  'bank_details',
  'taxIdentifier',
  'tax_identifier',
  'conditions',
  'allergies',
  'medications',
  'emergencyProtocol',
  'emergency_protocol',
  'narrative',
  'observations',
  'existingConditions',
  'pastTherapyHistory',
  'disabilityCategory',
  'severityLevel',
  'wrappedKey',
  'wrapped_key',
];

export function scrubSensitive(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(scrubSensitive);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE.some((s) => s.toLowerCase() === k.toLowerCase())) {
        out[k] = '[REDACTED]';
      } else {
        out[k] = scrubSensitive(v);
      }
    }
    return out;
  }
  return value;
}
