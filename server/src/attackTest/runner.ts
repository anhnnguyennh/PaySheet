import "dotenv/config";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { hasLiveAi } from "../ai/client.js";
import { buildTextScenarios } from "./textScenarios.js";
import { runTextScenario } from "./textRunner.js";
import { runWorkflowScenarios } from "./workflowScenarios.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  console.log(`\nPaySheet attack test — ${hasLiveAi() ? "live Claude extraction" : "offline heuristic parser (no ANTHROPIC_API_KEY set)"}\n`);

  const textScenarios = buildTextScenarios();
  const textOutcomes = await Promise.all(textScenarios.map(runTextScenario));
  const workflowOutcomes = runWorkflowScenarios();

  const rows = [
    ...textOutcomes.map((o) => ({
      id: o.scenario.id,
      title: o.scenario.title,
      category: o.scenario.category,
      paysheetBad: o.paysheetBad,
      paysheetDetail: o.paysheetDetail,
      naiveBad: o.naiveBad,
      naiveDetail: o.naiveDetail,
    })),
    ...workflowOutcomes,
  ];

  const total = rows.length;
  const paysheetBadCount = rows.filter((r) => r.paysheetBad).length;
  const naiveBadCount = rows.filter((r) => r.naiveBad).length;

  console.log(`Scenarios run: ${total}\n`);
  console.table(
    rows.map((r) => ({
      id: r.id,
      category: r.category,
      naive: r.naiveBad ? "BAD PAYMENT" : "ok",
      paysheet: r.paysheetBad ? "BAD PAYMENT" : "blocked/flagged",
    })),
  );

  console.log("\n=== Scoreboard ===");
  console.log(`Naive single-pipeline assistant : ${naiveBadCount} / ${total} scenarios resulted in a bad payment`);
  console.log(`PaySheet                        : ${paysheetBadCount} / ${total} scenarios resulted in a bad payment`);

  const failures = rows.filter((r) => r.paysheetBad);
  if (failures.length > 0) {
    console.log("\n!! PaySheet failures (should be investigated) !!");
    for (const f of failures) console.log(` - [${f.id}] ${f.title}: ${f.paysheetDetail}`);
  } else {
    console.log("\nPaySheet let zero bad payments through.");
  }

  const outPath = path.join(__dirname, "..", "..", "..", "attack-test-results.json");
  writeFileSync(
    outPath,
    JSON.stringify(
      {
        ranAt: new Date().toISOString(),
        liveAi: hasLiveAi(),
        total,
        naiveBadCount,
        paysheetBadCount,
        rows,
      },
      null,
      2,
    ),
  );
  console.log(`\nFull results written to ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
