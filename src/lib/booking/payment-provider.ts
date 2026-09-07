import { Prisma, PaymentMethod } from '@prisma/client';

export interface PaymentIntentParams {
  reservationId: string;
  reservationNumber: string;
  amount: Prisma.Decimal;
  currency: string;
  guest: {
    name: string;
    email: string;
    phone: string;
  };
}

export interface PaymentIntentResult {
  clientSecret?: string;
  checkoutUrl?: string;
  transactionReference: string;
  provider: string;
}

export interface WebhookVerificationResult {
  isValid: boolean;
  eventId: string;
  eventType: 'payment.success' | 'payment.failed';
  provider: string;
  providerTransactionId: string;
  idempotencyKey: string;
  reservationId: string;
  amount: Prisma.Decimal;
  currency: string;
  method: PaymentMethod;
  errorMessage?: string;
}

export interface PaymentGatewayProvider {
  name: string;
  createPaymentIntent(params: PaymentIntentParams): Promise<PaymentIntentResult>;
  verifyWebhook(payload: unknown, signature: string): Promise<WebhookVerificationResult>;
}

/**
 * Phase 0.8 Mock Payment Gateway Provider.
 * Allows deterministic automated testing of payment success, declines, and webhooks.
 */
export class MockPaymentGatewayProvider implements PaymentGatewayProvider {
  name = 'MOCK_GATEWAY';

  async createPaymentIntent(params: PaymentIntentParams): Promise<PaymentIntentResult> {
    const txRef = `MOCK-TX-${params.reservationNumber}-${Date.now()}`;
    return {
      transactionReference: txRef,
      provider: this.name,
      checkoutUrl: `/booking/payment/mock?tx=${txRef}&res=${params.reservationId}`,
    };
  }

  async verifyWebhook(payload: unknown, signature: string): Promise<WebhookVerificationResult> {
    const data = payload as any;
    // In mock mode, verify signature format
    if (!signature || signature.length < 5) {
      return {
        isValid: false,
        eventId: data?.eventId || 'unknown',
        eventType: 'payment.failed',
        provider: this.name,
        providerTransactionId: data?.providerTransactionId || '',
        idempotencyKey: data?.idempotencyKey || '',
        reservationId: data?.reservationId || '',
        amount: new Prisma.Decimal(data?.amount || 0),
        currency: 'INR',
        method: PaymentMethod.ONLINE,
        errorMessage: 'Invalid gateway signature',
      };
    }

    return {
      isValid: true,
      eventId: data.eventId,
      eventType: data.eventType,
      provider: data.provider || this.name,
      providerTransactionId: data.providerTransactionId,
      idempotencyKey: data.idempotencyKey,
      reservationId: data.reservationId,
      amount: new Prisma.Decimal(data.amount),
      currency: data.currency || 'INR',
      method: data.method || PaymentMethod.ONLINE,
      errorMessage: data.errorMessage,
    };
  }
}

export const defaultPaymentGateway = new MockPaymentGatewayProvider();
