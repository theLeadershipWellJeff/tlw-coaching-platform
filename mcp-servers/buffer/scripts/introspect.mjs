#!/usr/bin/env node
// Buffer GraphQL schema introspection.
// Prints a focused, paste-friendly summary of the types this MCP server cares
// about, and also writes the full filtered schema to ./schema.json for the
// record. Run with no arguments:
//   npm run introspect
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const configPath = resolve(root, "config.json");

let apiKey = process.env.BUFFER_API_KEY;
if (!apiKey && existsSync(configPath)) {
  const cfg = JSON.parse(readFileSync(configPath, "utf-8"));
  apiKey = cfg.buffer_api_key;
}
if (!apiKey || apiKey.startsWith("REPLACE_")) {
  console.error("Missing Buffer API key. Fill config.json or set BUFFER_API_KEY.");
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

// Save full filtered data for later reference (gitignored).
const outPath = resolve(root, "schema.json");
writeFileSync(
  outPath,
  JSON.stringify(
    { queryRoot, mutationRoot, typeCount: filtered.length, types: filtered },
    null,
    2
  )
);

// --- Human-readable summary to stdout (this is what you paste back) ---

function typeName(t) {
  if (!t) return "?";
  if (t.kind === "NON_NULL") return typeName(t.ofType) + "!";
  if (t.kind === "LIST") return "[" + typeName(t.ofType) + "]";
  return t.name ?? t.kind ?? "?";
}

console.log("=".repeat(72));
console.log("BUFFER GRAPHQL SCHEMA SUMMARY");
console.log("=".repeat(72));
console.log(`queryRoot:    ${queryRoot}`);
console.log(`mutationRoot: ${mutationRoot}`);
console.log(`(full schema written to ${outPath})`);
console.log();

const byName = new Map(filtered.map((t) => [t.name, t]));

function printType(name) {
  const t = byName.get(name);
  if (!t) {
    console.log(`  (type ${name} not found)`);
    return;
  }
  console.log(`--- ${t.name} (${t.kind}) ---`);
  if (t.description) console.log(`  // ${t.description.split("\n")[0]}`);
  if (t.fields) {
    for (const f of t.fields) {
      const args = (f.args ?? [])
        .map((a) => `${a.name}: ${typeName(a.type)}`)
        .join(", ");
      const argStr = args ? `(${args})` : "";
      console.log(`  ${f.name}${argStr}: ${typeName(f.type)}`);
    }
  }
  if (t.inputFields) {
    for (const f of t.inputFields) {
      console.log(`  ${f.name}: ${typeName(f.type)}`);
    }
  }
  console.log();
}

// Roots first.
printType(queryRoot);
printType(mutationRoot);

// Then anything we care about, in a sensible order.
const priority = [
  "Channel",
  "ChannelsInput",
  "Post",
  "PostStatus",
  "PostInput",
  "CreatePostInput",
  "PostCreated",
  "PostDeleted",
  "DeletePostInput",
  "Asset",
  "AssetInput",
  "Media",
  "MediaInput",
  "UserError",
];
const seen = new Set([queryRoot, mutationRoot]);
for (const n of priority) {
  if (byName.has(n) && !seen.has(n)) {
    printType(n);
    seen.add(n);
  }
}
// Anything left that matched the filter.
for (const t of filtered) {
  if (!seen.has(t.name)) {
    printType(t.name);
    seen.add(t.name);
  }
}

console.log("=".repeat(72));
console.log("END OF SUMMARY. Paste everything above this line back to Claude.");
console.log("=".repeat(72));
