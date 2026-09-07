import { NextRequest, NextResponse } from 'next/server';
import { gatewayWebhookSchema } from '@/lib/booking/schema';
import { processPaymentWebhook } from '@/lib/booking/reservation-service';
import { defaultPaymentGateway } from '@/lib/booking/payment-provider';

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.json();
    const signature = request.headers.get('x-gateway-signature') || '';

    // 1. Verify Gateway Signature
    const verification = await defaultPaymentGateway.verifyWebhook(rawBody, signature);
    if (!verification.isValid) {
      return NextResponse.json({ error: 'Unauthorized: Invalid gateway signature' }, { status: 401 });
    }

    // 2. Validate Typed Schema
    const parsed = gatewayWebhookSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid webhook payload structure', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    // 3. Process Webhook with Authoritative State Matrix
    const result = await processPaymentWebhook(parsed.data);

    return NextResponse.json({ success: true, result });
  } catch (error: any) {
    console.error('[GATEWAY_WEBHOOK_ERROR]', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to process gateway webhook' },
      { status: 500 }
    );
  }
}
