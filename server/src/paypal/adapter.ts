export interface PayoutItemResult {
  payoutBatchId: string;
  payoutItemId: string;
  status: "PENDING" | "SUCCESS" | "FAILED" | "UNCLAIMED";
  failureReason?: string;
}

export interface CancelResult {
  reversed: boolean;
  reason: string;
}

export interface PaypalAdapter {
  readonly mode: "mock" | "live";
  sendPayout(args: {
    idempotencyKey: string;
    recipientEmail: string;
    amountCents: number;
    note: string;
  }): Promise<PayoutItemResult>;
  tryCancel(payoutItemId: string): Promise<CancelResult>;
  /** Lets the mock adapter simulate PayPal's async webhook; live adapter is a no-op. */
  onStatusChange(cb: (payoutItemId: string, status: PayoutItemResult["status"]) => void): void;
}

export function isLiveConfigured(): boolean {
  return Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET);
}
