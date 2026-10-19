import { ApiError } from '../../../../utils/ApiError.js';
import { resolveConfiguredGatewayCredentials } from '../../services/paymentGatewayService.js';

/// Partial refund of a captured Razorpay payment. Amount is in rupees.
export const refundRazorpayPayment = async ({ paymentId, amount, notes = {} }) => {
  const rupees = Math.round(Number(amount || 0) * 100) / 100;
  if (!paymentId || rupees <= 0) {
    return null;
  }

  const { keyId, keySecret } = await resolveConfiguredGatewayCredentials('razor_pay');
  const credentials = Buffer.from(`${keyId}:${keySecret}`).toString('base64');
  const response = await fetch(`https://api.razorpay.com/v1/payments/${paymentId}/refund`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ amount: Math.round(rupees * 100), notes }),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(
      response.status || 502,
      payload?.error?.description || payload?.error?.message || 'Razorpay refund failed',
    );
  }

  return payload;
};
