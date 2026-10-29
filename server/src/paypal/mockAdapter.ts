import { nanoid } from "nanoid";
import type { CancelResult, PaypalAdapter, PayoutItemResult } from "./adapter.js";

type Listener = (payoutItemId: string, status: PayoutItemResult["status"]) => void;

/**
 * Simulates PayPal's sandbox behavior closely enough to demo the full
 * lifecycle without real credentials: items start PENDING, resolve to
 * SUCCESS (or occasionally FAILED, for realism) a couple seconds later via
 * the same "webhook" path the live adapter would use, and unclaimed items
 * can be cancelled.
 */
export function createMockAdapter(): PaypalAdapter {
  const listeners: Listener[] = [];
  const items = new Map<
    string,
    { status: PayoutItemResult["status"]; recipientEmail: string; idempotencyKey: string }
  >();
  const usedIdempotencyKeys = new Map<string, PayoutItemResult>();

  function emit(payoutItemId: string, status: PayoutItemResult["status"]) {
    const item = items.get(payoutItemId);
    if (item) item.status = status;
    for (const l of listeners) l(payoutItemId, status);
  }

  return {
    mode: "mock",

    async sendPayout({ idempotencyKey, recipientEmail, amountCents }) {
      const existing = usedIdempotencyKeys.get(idempotencyKey);
      if (existing) return existing; // real PayPal dedupes on this too

      const payoutBatchId = `MOCKBATCH_${nanoid(8)}`;
      const payoutItemId = `MOCKITEM_${nanoid(10)}`;
      items.set(payoutItemId, { status: "PENDING", recipientEmail, idempotencyKey });

      const result: PayoutItemResult = { payoutBatchId, payoutItemId, status: "PENDING" };
      usedIdempotencyKeys.set(idempotencyKey, result);

      const looksBadEmail = !/.+@.+\..+/.test(recipientEmail);
      setTimeout(() => {
        if (looksBadEmail || amountCents <= 0) {
          emit(payoutItemId, "FAILED");
        } else {
          emit(payoutItemId, "SUCCESS");
        }
      }, 1500 + Math.random() * 1500);

      return result;
    },

    async tryCancel(payoutItemId: string): Promise<CancelResult> {
      const item = items.get(payoutItemId);
      if (!item) return { reversed: false, reason: "Unknown payout item." };
      if (item.status === "SUCCESS") {
        return { reversed: false, reason: "Recipient already claimed this payout — PayPal cannot reverse it." };
      }
      if (item.status === "FAILED") {
        return { reversed: false, reason: "This payment already failed; there is nothing to reverse." };
      }
      emit(payoutItemId, "FAILED");
      return { reversed: true, reason: "Cancelled before the recipient claimed it." };
    },

    onStatusChange(cb) {
      listeners.push(cb);
    },
  };
}
