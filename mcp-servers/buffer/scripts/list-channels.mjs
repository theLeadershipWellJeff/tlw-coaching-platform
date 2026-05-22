#!/usr/bin/env node
// Phase 1 verification: confirms the Buffer API key works and prints channel IDs.
// Usage:
//   BUFFER_API_KEY=xxx node scripts/list-channels.mjs
// or after creating config.json:
//   node scripts/list-channels.mjs
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const configPath = resolve(here, "..", "config.json");

let apiKey = process.env.BUFFER_API_KEY;
if (!apiKey && existsSync(configPath)) {
  const cfg = JSON.parse(readFileSync(configPath, "utf-8"));
  apiKey = cfg.buffer_api_key;
}
if (!apiKey || apiKey.startsWith("REPLACE_")) {
  console.error(
    "Missing Buffer API key. Set BUFFER_API_KEY env var or fill config.json."
  );
  process.exit(1);
}

const query = `
  query ListChannels {
    channels {
      id
      name
      service
      serviceUsername
      serviceType
    }
  }
`;

const res = await fetch("https://api.buffer.com/graphql", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  },
  body: JSON.stringify({ query }),
});

const json = await res.json();
console.log(JSON.stringify(json, null, 2));

if (json.errors) {
  console.error("\nGraphQL errors returned. Re-check the API key and schema.");
  process.exit(2);
}

const channels = json.data?.channels ?? [];
if (channels.length === 0) {
  console.error("\nNo channels returned. Connect accounts in Buffer first.");
  process.exit(3);
}

console.log("\nSuggested config.channels block:");
const suggestion = {};
for (const ch of channels) {
  const key = (ch.service || ch.serviceType || ch.name || ch.id)
    .toString()
    .toLowerCase();
  suggestion[key] = ch.id;
}
console.log(JSON.stringify(suggestion, null, 2));
