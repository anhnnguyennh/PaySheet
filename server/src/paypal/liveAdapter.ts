import { nanoid } from "nanoid";
import type { CancelResult, PaypalAdapter, PayoutItemResult } from "./adapter.js";

type Listener = (payoutItemId: string, status: PayoutItemResult["status"]) => void;

const BASE =
  process.env.PAYPAL_ENV === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";

let cachedToken: { value: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.value;

  const basic = Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`).toString(
    "base64",
  );
  const res = await fetch(`${BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw new Error(`PayPal OAuth failed: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { value: json.access_token, expiresAt: Date.now() + (json.expires_in - 60) * 1000 };
  return cachedToken.value;
}

/** Called by the /webhooks/paypal route when a real PAYMENT.PAYOUTS-ITEM.* event arrives. */
const listeners: Listener[] = [];
export function notifyLivePayoutWebhook(payoutItemId: string, status: PayoutItemResult["status"]) {
  for (const l of listeners) l(payoutItemId, status);
}

export function createLiveAdapter(): PaypalAdapter {
  return {
    mode: "live",

    async sendPayout({ idempotencyKey, recipientEmail, amountCents, note }) {
      const token = await getAccessToken();
      const res = await fetch(`${BASE}/v1/payments/payouts`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "PayPal-Request-Id": idempotencyKey,
        },
        body: JSON.stringify({
          sender_batch_header: {
            sender_batch_id: idempotencyKey,
            email_subject: "You have a payment from PaySheet",
          },
          items: [
            {
              recipient_type: "EMAIL",
              amount: { value: (amountCents / 100).toFixed(2), currency: "USD" },
              receiver: recipientEmail,
              note,
              sender_item_id: idempotencyKey,
            },
          ],
        }),
      });
      if (!res.ok) {
        return {
          payoutBatchId: "",
          payoutItemId: "",
          status: "FAILED",
          failureReason: `PayPal rejected the payout: ${res.status} ${await res.text()}`,
        };
      }
      const json = (await res.json()) as { batch_header: { payout_batch_id: string } };
      const payoutBatchId = json.batch_header.payout_batch_id;

      // Payout item id isn't returned synchronously; look it up once the
      // batch has been accepted so we have something to key the UI on.
      const itemId = await lookupItemId(token, payoutBatchId).catch(() => `PENDING_${nanoid(8)}`);

      return { payoutBatchId, payoutItemId: itemId, status: "PENDING" };
    },

    async tryCancel(payoutItemId: string): Promise<CancelResult> {
      const token = await getAccessToken();
      const res = await fetch(`${BASE}/v1/payments/payouts-item/${payoutItemId}/cancel`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) return { reversed: true, reason: "Cancelled before the recipient claimed it." };
      return { reversed: false, reason: `PayPal could not cancel it: ${res.status} ${await res.text()}` };
    },

    onStatusChange(cb) {
      listeners.push(cb);
    },
  };
}

async function lookupItemId(token: string, payoutBatchId: string): Promise<string> {
  const res = await fetch(`${BASE}/v1/payments/payouts/${payoutBatchId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = (await res.json()) as { items?: { payout_item_id: string }[] };
  return json.items?.[0]?.payout_item_id ?? `PENDING_${nanoid(8)}`;
}
