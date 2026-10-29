import { JSONFilePreset } from "lowdb/node";
import { nanoid } from "nanoid";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createDefaultDb } from "./defaultDb.js";
import type { Db } from "./types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataFile = path.join(__dirname, "..", "data", "db.json");

export const db = await JSONFilePreset<Db>(dataFile, createDefaultDb());

export function recordHistory(entry: Omit<Db["history"][number], "id" | "at">) {
  db.data.history.push({
    id: nanoid(),
    at: new Date().toISOString(),
    ...entry,
  });
}
