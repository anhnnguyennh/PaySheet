import { useState } from "react";
import type { Rule } from "../types";

interface Props {
  rules: Rule[];
  onAdd: (rule: Omit<Rule, "id">) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

export function RulesTab({ rules, onAdd, onDelete }: Props) {
  const [kind, setKind] = useState<Rule["kind"]>("max_single_payment");
  const [category, setCategory] = useState("");
  const [limit, setLimit] = useState("");
  const [description, setDescription] = useState("");

  async function submit() {
    if (!limit || !description) return;
    await onAdd({
      kind,
      category: kind === "max_monthly_category" ? category || "general" : null,
      limitCents: Math.round(parseFloat(limit) * 100),
      description,
    });
    setLimit("");
    setDescription("");
    setCategory("");
  }

  return (
    <div className="panel">
      <p className="section-title">Rules tab</p>
      <p className="muted">
        Written by a human, enforced by code. The AI can read these to explain them but has no way to edit them —
        there is no code path from the parser to this list.
      </p>
      {rules.map((r) => (
        <div key={r.id} className="rule-row">
          <span>{r.description}</span>
          <button className="btn secondary" onClick={() => onDelete(r.id)}>
            Remove
          </button>
        </div>
      ))}

      <div className="small-form">
        <select value={kind} onChange={(e) => setKind(e.target.value as Rule["kind"])}>
          <option value="max_single_payment">Max single payment</option>
          <option value="max_monthly_category">Max monthly (category)</option>
          <option value="dual_approval_threshold">Dual-approval threshold</option>
        </select>
        {kind === "max_monthly_category" && (
          <input placeholder="category (e.g. food)" value={category} onChange={(e) => setCategory(e.target.value)} />
        )}
        <input placeholder="limit $" value={limit} onChange={(e) => setLimit(e.target.value)} />
        <input placeholder="description" value={description} onChange={(e) => setDescription(e.target.value)} />
        <button className="btn" onClick={submit}>
          Add rule
        </button>
      </div>
    </div>
  );
}
