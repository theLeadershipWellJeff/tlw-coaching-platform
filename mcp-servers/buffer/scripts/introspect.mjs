#!/usr/bin/env node
// One-off Buffer GraphQL schema introspection.
// Captures Query/Mutation roots and any type whose name involves channels,
// posts, assets, media, or *Input. Run before going live to verify the
// real schema matches what src/buffer/client.ts assumes.
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
      queryType { name }
      mutationType { name }
      types {
        name
        kind
        description
        inputFields {
          name
          description
          type { name kind ofType { name kind ofType { name kind ofType { name kind } } } }
        }
        fields {
          name
          description
          args {
            name
            type { name kind ofType { name kind ofType { name kind } } }
          }
          type { name kind ofType { name kind ofType { name kind ofType { name kind } } } }
        }
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

const schema = json.data.__schema;
const queryRoot = schema.queryType?.name ?? "Query";
const mutationRoot = schema.mutationType?.name ?? "Mutation";

const NAME_PATTERN = /channel|post|asset|media|input|usererror|created|deleted/i;
const KEEP_EXACT = new Set([queryRoot, mutationRoot]);

const filtered = schema.types.filter((t) => {
  if (!t.name) return false;
  if (t.name.startsWith("__")) return false;
  if (KEEP_EXACT.has(t.name)) return true;
  return NAME_PATTERN.test(t.name);
});

console.log(
  JSON.stringify(
    {
      queryRoot,
      mutationRoot,
      typeCount: filtered.length,
      types: filtered,
    },
    null,
    2
  )
);
