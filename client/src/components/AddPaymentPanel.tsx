import { useState } from "react";

export function AddPaymentPanel({ onAdd }: { onAdd: (text: string) => Promise<void> }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!text.trim()) return;
    setBusy(true);
    try {
      await onAdd(text);
      setText("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel add-panel">
      <p className="section-title">Add a payment</p>
      <textarea
        placeholder={`Type "Pay Alex $40 for pizza", or paste a whole invoice or email…`}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="btn-row">
        <button className="btn" disabled={busy} onClick={submit}>
          {busy ? "Reading…" : "Add to sheet"}
        </button>
        <span className="muted">The AI only fills in the row — nothing is ever paid without your approval.</span>
      </div>
    </div>
  );
}
