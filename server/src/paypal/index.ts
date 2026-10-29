import { isLiveConfigured, type PaypalAdapter } from "./adapter.js";
import { createLiveAdapter } from "./liveAdapter.js";
import { createMockAdapter } from "./mockAdapter.js";

let instance: PaypalAdapter | null = null;

export function getPaypalAdapter(): PaypalAdapter {
  if (!instance) {
    instance = isLiveConfigured() ? createLiveAdapter() : createMockAdapter();
    console.log(`[paypal] running in ${instance.mode} mode`);
  }
  return instance;
}

export { notifyLivePayoutWebhook } from "./liveAdapter.js";
export type { CancelResult, PayoutItemResult } from "./adapter.js";
