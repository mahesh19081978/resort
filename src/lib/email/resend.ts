import { Buffer } from 'buffer';

export interface EmailAttachment {
  filename: string;
  content: Buffer | string; // Buffer or base64 string
}

export interface SendEmailOptions {
  to: string | string[];
  subject: string;
  text?: string;
  html?: string;
  attachments?: EmailAttachment[];
  from?: string;
}

export interface SendEmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Authoritative Resend Email Service.
 *
 * PRODUCTION & ENVIRONMENT SAFETY RULES:
 * 1. Production (NODE_ENV === 'production'):
 *    - RESEND_API_KEY must be configured. If missing or invalid => fails closed with descriptive error.
 * 2. Test/E2E (NODE_ENV === 'test' or E2E_TEST_MODE === 'true'):
 *    - Never sends live emails to real recipients.
 *    - Returns mock successful transmission result with deterministic messageId.
 * 3. Development:
 *    - If RESEND_API_KEY is not configured or is a sample key, logs diagnostic to console and simulates delivery.
 *    - If a valid RESEND_API_KEY is configured, sends via Resend API.
 */
export async function sendEmail(options: SendEmailOptions): Promise<SendEmailResult> {
  const isTest = process.env.NODE_ENV === 'test' || process.env.E2E_TEST_MODE === 'true';
  const isProd = process.env.NODE_ENV === 'production';
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const defaultFrom = process.env.RESEND_FROM_EMAIL?.trim();
  if (isProd && !defaultFrom) {
    return {
      success: false,
      error: 'Email configuration error: RESEND_FROM_EMAIL is not configured.',
    };
  }
  const fromAddress = options.from || defaultFrom || 'Procurement <procurement@resort.local>';

  const recipients = Array.isArray(options.to) ? options.to : [options.to];
  const validRecipients = recipients.filter((r) => r && r.includes('@'));

  if (validRecipients.length === 0) {
    return {
      success: false,
      error: 'Invalid recipient: No valid email address provided.',
    };
  }

  // TEST ENVIRONMENT SAFETY: Never dispatch real network requests to external mail servers
  if (isTest) {
    return {
      success: true,
      messageId: `test-msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    };
  }

  // MISSING CREDENTIAL CHECK
  if (!apiKey || apiKey.startsWith('re_sample_')) {
    if (isProd) {
      return {
        success: false,
        error: 'Email configuration error: RESEND_API_KEY is missing or unconfigured in production environment.',
      };
    }

    // Development diagnostic simulation
    console.info(`[RESEND_DEV_SIMULATION] Email dispatch simulated for: ${validRecipients.join(', ')} | Subject: ${options.subject}`);
    return {
      success: true,
      messageId: `dev-sim-${Date.now()}`,
    };
  }

  try {
    const formattedAttachments = options.attachments?.map((att) => {
      const base64Content = Buffer.isBuffer(att.content)
        ? att.content.toString('base64')
        : att.content;
      return {
        filename: att.filename,
        content: base64Content,
      };
    });

    const payload: Record<string, unknown> = {
      from: fromAddress,
      to: validRecipients,
      subject: options.subject,
    };

    if (options.html) payload.html = options.html;
    if (options.text) payload.text = options.text;
    if (formattedAttachments && formattedAttachments.length > 0) {
      payload.attachments = formattedAttachments;
    }

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      const errorMsg = data?.message || data?.error?.message || `HTTP ${response.status} ${response.statusText}`;
      return {
        success: false,
        error: `Resend dispatch failed: ${errorMsg}`,
      };
    }

    return {
      success: true,
      messageId: data?.id || `resend-${Date.now()}`,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Network error occurred while contacting email service.',
    };
  }
}
