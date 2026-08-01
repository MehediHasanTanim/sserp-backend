import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentMethod } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { DomainException } from '../../../shared/errors/domain-exception';
import { PaymentGatewayPort } from '../providers/optional-integrations';
import { FeePaymentService } from '../../school/services/fee-payment.service';

@Injectable()
export class PortalPaymentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly payments: PaymentGatewayPort,
    private readonly feePayments: FeePaymentService,
    private readonly config: ConfigService,
  ) {}

  private assertGatewayEnabled() {
    if (!this.config.get('featurePaymentGateway')) {
      throw DomainException.forbidden('Payment gateway feature disabled');
    }
  }

  async createFeePaymentIntent(input: {
    invoiceId: string;
    studentId: string;
    returnUrl: string;
    userId: string;
    amount?: number;
  }) {
    this.assertGatewayEnabled();
    const invoice = await this.prisma.feeInvoice.findFirst({
      where: {
        id: input.invoiceId,
        studentId: input.studentId,
        status: { in: ['issued', 'partially_paid'] },
      },
    });
    if (!invoice) throw DomainException.notFound('Outstanding invoice not found');
    const amount = input.amount ?? invoice.outstandingAmount;
    if (amount <= 0 || amount > invoice.outstandingAmount) {
      throw DomainException.validation('Invalid payment amount');
    }

    const reference = `fee:${invoice.id}:${amount}`;
    const intent = await this.payments.createIntent({
      amount,
      currency: 'BDT',
      reference,
      returnUrl: input.returnUrl,
    });

    await this.prisma.paymentGatewayIntent.create({
      data: {
        gatewayTxnId: intent.gatewayTxnId,
        reference,
        invoiceId: invoice.id,
        amount,
        currency: 'BDT',
        status: 'pending',
        createdBy: input.userId,
      },
    });

    return {
      gatewayTxnId: intent.gatewayTxnId,
      redirectUrl: intent.redirectUrl,
      amount,
      invoiceId: invoice.id,
    };
  }

  /**
   * H-08: settle only after gateway verification — never from client success alone.
   */
  async settleWebhook(
    headers: Record<string, string>,
    body: unknown,
    systemActorId?: string,
  ) {
    this.assertGatewayEnabled();
    const result = await this.payments.verifyWebhook(headers, body);
    const txnId =
      result.gatewayTxnId ||
      (body as { tran_id?: string })?.tran_id ||
      '';

    if (!txnId) {
      return { accepted: false, gatewayTxnId: '' };
    }

    const intent = await this.prisma.paymentGatewayIntent.findUnique({
      where: { gatewayTxnId: txnId },
    });
    if (!intent) {
      return { accepted: false, gatewayTxnId: txnId, reason: 'unknown_intent' };
    }
    if (intent.status === 'settled') {
      return {
        accepted: true,
        gatewayTxnId: intent.gatewayTxnId,
        idempotent: true,
      };
    }
    if (!result.ok) {
      return { accepted: false, gatewayTxnId: txnId };
    }
    if (!intent.invoiceId) {
      throw DomainException.unprocessable('Intent missing invoice');
    }

    const actorId =
      systemActorId ??
      intent.createdBy ??
      (
        await this.prisma.user.findFirst({
          where: { isActive: true, deletedAt: null },
          orderBy: { createdAt: 'asc' },
          select: { id: true },
        })
      )?.id;
    if (!actorId) throw DomainException.unprocessable('No actor for settlement');

    await this.feePayments.pay(
      intent.invoiceId,
      {
        amount: intent.amount,
        method: PaymentMethod.online,
        reference: intent.gatewayTxnId,
        paymentDate: new Date().toISOString().slice(0, 10),
      },
      actorId,
    );

    await this.prisma.paymentGatewayIntent.update({
      where: { id: intent.id },
      data: { status: 'settled', settledAt: new Date() },
    });

    return {
      accepted: true,
      gatewayTxnId: intent.gatewayTxnId,
      invoiceId: intent.invoiceId,
    };
  }
}
