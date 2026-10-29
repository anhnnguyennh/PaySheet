import cors from "cors";
import "dotenv/config";
import express from "express";
import { getPaypalAdapter } from "./paypal/index.js";
import { router } from "./routes/index.js";
import { db, recordHistory } from "./store.js";

const app = express();
app.use(cors());
app.use(express.json());
app.use("/api", router);

const adapter = getPaypalAdapter();
adapter.onStatusChange(async (payoutItemId, status) => {
  const row = db.data.rows.find((r) => r.payoutItemId === payoutItemId);
  if (!row) {
    console.warn(`[webhook] ignored status update for unknown payout item ${payoutItemId}`);
    return;
  }
  if (status === "SUCCESS" && row.status === "processing") {
    row.status = "paid";
    db.data.balanceCents -= row.amountCents;
    recordHistory({ type: "payment_sent", rowId: row.id, actor: "paypal-webhook", detail: "PayPal confirmed the payout succeeded." });
  } else if (status === "FAILED" && row.status === "processing") {
    row.status = "failed";
    row.failureReason = "PayPal could not complete this payout (bad email or sandbox rejection).";
    recordHistory({ type: "payment_failed", rowId: row.id, actor: "paypal-webhook", detail: row.failureReason });
  }
  await db.write();
});

const port = Number(process.env.PORT ?? 4000);
app.listen(port, () => {
  console.log(`PaySheet server listening on http://localhost:${port}`);
});
