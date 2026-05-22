#!/usr/bin/env node
// Phase 1 verification: confirm the API key works, discover organizationId,
// and print connected channel IDs ready to paste into config.json.
//
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

async function gql(query, variables = {}) {
  const res = await fetch("https://api.buffer.com/graphql", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors) {
    console.error(JSON.stringify(json, null, 2));
    throw new Error("GraphQL errors - see output above");
  }
  return json.data;
}

const accountData = await gql(`
  query GetOrgs {
    account {
      id
      email
      organizations {
        id
        name
      }
    }
  }
`);

const orgs = accountData.account.organizations ?? [];
if (orgs.length === 0) {
  console.error("No Buffer organizations found on this account.");
  process.exit(2);
}

const org = orgs[0];
console.log(`Account:      ${accountData.account.email}`);
console.log(`Organization: ${org.name} (${org.id})`);
if (orgs.length > 1) {
  console.log(`(${orgs.length - 1} additional org(s) ignored - using the first.)`);
}
console.log();

const channelsData = await gql(
  `query ListChannels($input: ChannelsInput!) {
    channels(input: $input) {
      id
      name
      displayName
      service
      type
      isDisconnected
      isLocked
    }
  }`,
  { input: { organizationId: org.id } }
);

const channels = channelsData.channels;
if (channels.length === 0) {
  console.error("No channels connected to this organization in Buffer.");
  process.exit(3);
}

console.log(`Found ${channels.length} channel(s):`);
console.log();
for (const c of channels) {
  const status = c.isDisconnected ? " [DISCONNECTED]" : c.isLocked ? " [LOCKED]" : "";
  const label = c.displayName ? `${c.displayName} (${c.name})` : c.name;
  console.log(`  ${c.service.padEnd(16)} ${label}${status}`);
  console.log(`    id: ${c.id}`);
}
console.log();

const suggestion = { channels: {} };
suggestion.organization_id = org.id;
for (const c of channels) {
  if (c.isDisconnected) continue;
  if (!suggestion.channels[c.service]) {
    suggestion.channels[c.service] = c.id;
  }
}
console.log("Paste this block into config.json (replacing the existing");
console.log("organization_id and channels keys):");
console.log();
console.log(JSON.stringify(suggestion, null, 2));
