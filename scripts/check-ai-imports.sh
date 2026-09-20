#!/bin/sh
# Build gate: the Anthropic SDK may be imported ONLY by the AI gateway
# (lib/ai/**). Every other module must call lib/ai/client.ts so the call is
# routed by purpose (lib/ai/models.ts) and metered on the usage ledger.
# Runs as `prebuild` (so Vercel enforces it) and as `npm run check:ai-imports`.
#
# Allowed: lib/ai/**, node_modules, and the manual verification spikes under
# scripts/spikes/** (they run by hand with a key and are not deployed).
set -eu
cd "$(dirname "$0")/.."
hits=$(grep -rn --include='*.ts' --include='*.tsx' --include='*.js' --include='*.mjs' \
  -e "@anthropic-ai/sdk" -e "api.anthropic.com" \
  app lib components middleware.ts 2>/dev/null \
  | grep -v '^lib/ai/' || true)
if [ -n "$hits" ]; then
  echo "ERROR: direct Anthropic SDK usage outside lib/ai/ — route it through lib/ai/client.ts:" >&2
  echo "$hits" >&2
  exit 1
fi
echo "check-ai-imports: ok (no direct Anthropic SDK imports outside lib/ai/)"
