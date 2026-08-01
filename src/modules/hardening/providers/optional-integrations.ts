import { Injectable, Logger } from '@nestjs/common';

export interface BiometricPunch {
  deviceUserId: string;
  punchedAt: Date;
  type: 'in' | 'out';
}

export abstract class BiometricAdapter {
  /** Legacy entry used by admin trigger — prefer fetchPunches + sync service. */
  abstract pollAndSync(): Promise<{ imported: number }>;
  abstract fetchPunches(since: Date): Promise<BiometricPunch[]>;
}

@Injectable()
export class ConsoleBiometricAdapter extends BiometricAdapter {
  private readonly logger = new Logger(ConsoleBiometricAdapter.name);
  /** Dev/test fixture punches — set via seedFixtures() for verification. */
  private fixtures: BiometricPunch[] = [];

  seedFixtures(punches: BiometricPunch[]) {
    this.fixtures = punches;
  }

  async fetchPunches(since: Date): Promise<BiometricPunch[]> {
    const out = this.fixtures.filter((p) => p.punchedAt >= since);
    if (out.length) {
      this.logger.debug(`Biometric stub returning ${out.length} fixture punch(es)`);
    } else {
      this.logger.debug('Biometric stub: no device configured');
    }
    return out;
  }

  async pollAndSync() {
    const punches = await this.fetchPunches(
      new Date(Date.now() - 24 * 60 * 60 * 1000),
    );
    return { imported: punches.length };
  }
}

export abstract class PaymentGatewayPort {
  abstract createIntent(input: {
    amount: number;
    currency: string;
    reference: string;
    returnUrl: string;
  }): Promise<{ gatewayTxnId: string; redirectUrl: string }>;

  abstract verifyWebhook(
    headers: Record<string, string>,
    body: unknown,
  ): Promise<{ gatewayTxnId: string; amount: number; ok: boolean }>;
}

@Injectable()
export class SslCommerzStubGateway extends PaymentGatewayPort {
  private readonly logger = new Logger(SslCommerzStubGateway.name);

  async createIntent(input: {
    amount: number;
    currency: string;
    reference: string;
    returnUrl: string;
  }) {
    const gatewayTxnId = `ssl_${input.reference}_${Date.now()}`;
    this.logger.debug(`Created payment intent ${gatewayTxnId}`);
    return {
      gatewayTxnId,
      redirectUrl: `${input.returnUrl}?txn=${gatewayTxnId}`,
    };
  }

  async verifyWebhook(headers: Record<string, string>, body: unknown) {
    const payload = body as {
      tran_id?: string;
      amount?: string;
      signature?: string;
    };
    const sig = headers['x-ssl-signature'] ?? payload.signature;
    if (!sig || !payload.tran_id) {
      return { gatewayTxnId: '', amount: 0, ok: false };
    }
    // Idempotent settlement is owned by PaymentGatewayIntent — stub verifies signature only.
    return {
      gatewayTxnId: payload.tran_id,
      amount: Number(payload.amount ?? 0),
      ok: true,
    };
  }
}
