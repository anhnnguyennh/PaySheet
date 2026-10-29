import { useState } from "react";
import type { Contact } from "../types";

interface Props {
  contacts: Contact[];
  onAdd: (name: string, email: string) => Promise<void>;
}

export function ContactsPanel({ contacts, onAdd }: Props) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  async function submit() {
    if (!name || !email) return;
    await onAdd(name, email);
    setName("");
    setEmail("");
  }

  return (
    <div className="panel">
      <p className="section-title">Approved contacts</p>
      <p className="muted">Money can only go to people here. A fake invoice naming a stranger gets flagged, never paid, until someone explicitly adds them.</p>
      {contacts.map((c) => (
        <div key={c.id} className="contact-row">
          <span>
            {c.name} — {c.email}
          </span>
          <span className="muted">added by {c.approvedBy}</span>
        </div>
      ))}
      <div className="small-form">
        <input placeholder="name" value={name} onChange={(e) => setName(e.target.value)} />
        <input placeholder="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <button className="btn" onClick={submit}>
          Add contact
        </button>
      </div>
    </div>
  );
}
