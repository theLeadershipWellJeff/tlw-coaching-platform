import { appendFileSync, existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { DateTime } from "luxon";

const HEADER = "timestamp,channel,post_id,scheduled_for,text_preview\n";

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export interface MetricsRow {
  channel: string;
  postId: string;
  scheduledFor?: string;
  textPreview: string;
}

export function logPost(metricsPath: string, row: MetricsRow): void {
  const path = resolve(metricsPath);
  if (!existsSync(path)) {
    writeFileSync(path, HEADER, "utf-8");
  }
  const ts = DateTime.utc().toISO({ suppressMilliseconds: true }) ?? "";
  const line =
    [
      ts,
      row.channel,
      row.postId,
      row.scheduledFor ?? "",
      row.textPreview.slice(0, 80),
    ]
      .map(csvEscape)
      .join(",") + "\n";
  appendFileSync(path, line, "utf-8");
}
