import type { PaymentStatus } from "../types";

const LABELS: Record<PaymentStatus, string> = {
  draft: "Draft",
  planned: "Ready",
  flagged: "Needs review",
  approved: "Approved",
  processing: "Processing…",
  paid: "Paid",
  failed: "Failed",
  reversed: "Reversed",
};

export function StatusChip({ status }: { status: PaymentStatus }) {
  return <span className={`status-chip status-${status}`}>{LABELS[status]}</span>;
}
