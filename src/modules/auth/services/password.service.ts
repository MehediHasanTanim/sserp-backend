import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { ConfigService } from '@nestjs/config';
import {
  DomainException,
  ErrorCode,
} from '../../../shared/errors/domain-exception';

@Injectable()
export class PasswordService {
  constructor(private readonly config: ConfigService) {}

  get cost() {
    return this.config.get<number>('bcryptCost') ?? 12;
  }

  validatePolicy(password: string) {
    const errors: string[] = [];
    if (password.length < 10) errors.push('at least 10 characters');
    if (!/[A-Z]/.test(password)) errors.push('one uppercase letter');
    if (!/[a-z]/.test(password)) errors.push('one lowercase letter');
    if (!/[0-9]/.test(password)) errors.push('one digit');
    if (errors.length) {
      throw new DomainException(
        ErrorCode.WEAK_PASSWORD,
        422,
        `Password must contain ${errors.join(', ')}`,
      );
    }
  }

  async hash(password: string): Promise<string> {
    this.validatePolicy(password);
    return bcrypt.hash(password, this.cost);
  }

  async verify(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  assertNotInHistory(password: string, history: string[]) {
    // history stores hashes; caller must verify asynchronously — sync check not possible
    // Kept for API symmetry; use assertNotInHistoryAsync
    void password;
    void history;
  }

  async assertNotInHistoryAsync(password: string, history: string[]) {
    const recent = history.slice(-3);
    for (const h of recent) {
      if (await bcrypt.compare(password, h)) {
        throw new DomainException(
          ErrorCode.WEAK_PASSWORD,
          422,
          'Cannot reuse one of the last 3 passwords',
        );
      }
    }
  }
}
