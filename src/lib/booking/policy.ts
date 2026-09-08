export interface PaymentPolicy {
  allowPayAtHotel: boolean;
  mandatoryAdvance: boolean;
}

/**
 * Authoritative hotel payment policy configuration.
 * By default, online payment and pay at hotel are both supported.
 * If NEXT_PUBLIC_MANDATORY_ADVANCE is set to 'true', Pay at Hotel is disallowed or requires advance deposit.
 * If NEXT_PUBLIC_ALLOW_PAY_AT_HOTEL is set to 'false', Pay at Hotel is disabled.
 */
export function getPaymentPolicy(): PaymentPolicy {
  // Prefer authoritative server-side environment variables first
  const mandatoryAdvance =
    process.env.MANDATORY_ADVANCE === 'true' ||
    process.env.NEXT_PUBLIC_MANDATORY_ADVANCE === 'true';

  const serverAllow = process.env.ALLOW_PAY_AT_HOTEL;
  const clientAllow = process.env.NEXT_PUBLIC_ALLOW_PAY_AT_HOTEL;
  const configuredAllow = serverAllow !== undefined ? serverAllow : clientAllow;

  // If mandatory advance is required, Pay at Hotel without advance is strictly not allowed
  const allowPayAtHotel = mandatoryAdvance
    ? false
    : configuredAllow !== 'false';

  return {
    allowPayAtHotel,
    mandatoryAdvance,
  };
}
