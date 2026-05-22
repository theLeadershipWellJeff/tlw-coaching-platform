#!/usr/bin/env node
// One-off Buffer GraphQL schema introspection.
// Run this BEFORE going live to verify the createPost/assets input shape matches
// what src/buffer/client.ts assumes. Update queries.ts (inline GraphQL in client.ts)
// if Buffer's actual schema differs.
//
// Usage:
//   BUFFER_API_KEY=xxx node scripts/introspect.mjs > schema.json
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
  console.error("Missing Buffer API key.");
  process.exit(1);
}

const introspection = `
  query Introspect {
    __schema {
      types {
        name
        kind
        inputFields { name type { name kind ofType { name kind } } }
        fields { name type { name kind ofType { name kind } } }
      }
    }
  }
`;

const res = await fetch("https://api.buffer.com/graphql", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  },
  body: JSON.stringify({ query: introspection }),
});

const json = await res.json();
if (json.errors) {
  console.error("Introspection errors:", JSON.stringify(json.errors, null, 2));
  process.exit(2);
}

const types = json.data.__schema.types;
const interesting = [
  "CreatePostInput",
  "AssetInput",
  "MediaInput",
  "Asset",
  "Media",
  "Post",
  "Channel",
  "PostCreated",
  "UserError",
  "Mutation",
  "Query",
];
const filtered = types.filter((t) => interesting.includes(t.name));
console.log(JSON.stringify({ types: filtered }, null, 2));
