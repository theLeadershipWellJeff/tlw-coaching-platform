import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const ConfigSchema = z.object({
  buffer_api_key: z.string().min(1),
  channels: z.record(z.string(), z.string()),
  default_schedule: z.record(z.string(), z.array(z.string())).default({}),
  timezone: z.string().default("America/Los_Angeles"),
  metrics_log_path: z.string().default("./metrics.csv"),
});

export type Config = z.infer<typeof ConfigSchema>;

export function loadConfig(): Config {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    process.env.TLW_BUFFER_CONFIG,
    resolve(here, "..", "..", "config.json"),
    resolve(process.cwd(), "config.json"),
  ].filter((p): p is string => typeof p === "string" && p.length > 0);

  const configPath = candidates.find((p) => existsSync(p));

  let raw: unknown;
  if (configPath) {
    raw = JSON.parse(readFileSync(configPath, "utf-8"));
  } else {
    raw = {
      buffer_api_key: "",
      channels: {},
    };
  }

  if (typeof raw === "object" && raw !== null) {
    const obj = raw as Record<string, unknown>;
    if (process.env.BUFFER_API_KEY) obj.buffer_api_key = process.env.BUFFER_API_KEY;
    if (process.env.BUFFER_TIMEZONE) obj.timezone = process.env.BUFFER_TIMEZONE;
  }

  const parsed = ConfigSchema.safeParse(raw);
  if (!parsed.success) {
    const where = configPath ?? "(no config.json found)";
    throw new Error(
      `Invalid Buffer MCP config at ${where}:\n${parsed.error.issues
        .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
        .join("\n")}`
    );
  }
  return parsed.data;
}

export function resolveChannelId(config: Config, ref: string): string {
  if (config.channels[ref]) return config.channels[ref];
  return ref;
}
