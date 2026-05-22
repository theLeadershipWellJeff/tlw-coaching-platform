#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { loadConfig, resolveChannelId } from "./config.js";
import { BufferClient, BufferApiError } from "./buffer/client.js";
import type { MediaAsset } from "./buffer/types.js";
import { resolveDueAt } from "./schedule.js";
import { logPost } from "./metrics.js";
import { BRAND_VOICE_GUIDANCE } from "./voice.js";

const config = loadConfig();
const buffer = new BufferClient(config.buffer_api_key, config.organization_id);

const ImageMediaSchema = z.object({
  type: z.literal("image"),
  url: z.string().url(),
  altText: z
    .string()
    .min(1, "Image alt text is required by Buffer for accessibility."),
  thumbnailUrl: z.string().url().optional(),
});
const VideoMediaSchema = z.object({
  type: z.literal("video"),
  url: z.string().url(),
  thumbnailUrl: z.string().url().optional(),
  title: z.string().optional(),
});
const DocumentMediaSchema = z.object({
  type: z.literal("document"),
  url: z.string().url(),
  title: z.string().min(1),
  thumbnailUrl: z.string().url(),
});
const LinkMediaSchema = z.object({
  type: z.literal("link"),
  url: z.string().url(),
  title: z.string().optional(),
  description: z.string().optional(),
  thumbnailUrl: z.string().url().optional(),
});
const MediaSchema = z.discriminatedUnion("type", [
  ImageMediaSchema,
  VideoMediaSchema,
  DocumentMediaSchema,
  LinkMediaSchema,
]);

const ChannelKeySchema = z
  .string()
  .describe(
    'Either a channel alias from config.channels (e.g. "linkedin") or a raw Buffer channel ID.'
  );

const ModeSchema = z
  .enum(["queue", "scheduled"])
  .describe(
    '"queue" appends to Buffer\'s queue (Buffer picks the slot). "scheduled" requires due_at OR a default_schedule entry for the channel.'
  );

function textResult(payload: unknown) {
  const text =
    typeof payload === "string" ? payload : JSON.stringify(payload, null, 2);
  return { content: [{ type: "text" as const, text }] };
}

function errorResult(err: unknown) {
  const message =
    err instanceof BufferApiError
      ? `Buffer API error: ${err.message}`
      : err instanceof Error
      ? err.message
      : String(err);
  return { content: [{ type: "text" as const, text: message }], isError: true };
}

function channelAliasFor(channelId: string): string | undefined {
  return Object.entries(config.channels).find(([, id]) => id === channelId)?.[0];
}

const server = new McpServer(
  { name: "tlw-buffer-mcp", version: "0.1.0" },
  {
    capabilities: { tools: {} },
    instructions:
      "Buffer social posting for TheLeadershipWell. When drafting posts, follow the brand voice. " +
      BRAND_VOICE_GUIDANCE,
  }
);

server.tool(
  "list_channels",
  "List the social channels connected to Buffer with their IDs and services.",
  {},
  async () => {
    try {
      const channels = await buffer.listChannels();
      return textResult({
        channels: channels.map((c) => ({
          id: c.id,
          name: c.name,
          displayName: c.displayName,
          descriptor: c.descriptor,
          service: c.service,
          type: c.type,
          isDisconnected: c.isDisconnected,
        })),
        configured_aliases: config.channels,
      });
    } catch (err) {
      return errorResult(err);
    }
  }
);

server.tool(
  "create_post",
  "Create a single post on one Buffer channel. mode='queue' lets Buffer pick the next slot. mode='scheduled' requires due_at OR a default_schedule entry. Instagram posts require image media.",
  {
    text: z.string().min(1, "text is required"),
    channel: ChannelKeySchema,
    mode: ModeSchema.default("queue"),
    due_at: z
      .string()
      .optional()
      .describe(
        "ISO 8601 timestamp for scheduled posts. If omitted, uses the next default schedule slot for this channel."
      ),
    media: z
      .array(MediaSchema)
      .optional()
      .describe(
        "Optional media. Each item is a discriminated union by 'type'. Required for Instagram posts (must be type='image' with altText)."
      ),
  },
  async ({ text, channel, mode, due_at, media }) => {
    try {
      const channelId = resolveChannelId(config, channel);
      const channelKey = channelAliasFor(channelId);

      const isInstagram =
        channelKey === "instagram" ||
        (await buffer
          .listChannels()
          .then((cs) => cs.find((c) => c.id === channelId)?.service === "instagram")
          .catch(() => false));

      if (isInstagram) {
        const hasImage = media?.some((m) => m.type === "image");
        if (!hasImage) {
          return errorResult(
            new Error("Instagram requires an image - none provided.")
          );
        }
      }

      const defaultSlots = channelKey
        ? config.default_schedule[channelKey]
        : undefined;

      const dueAtIso = resolveDueAt({
        mode,
        dueAt: due_at,
        defaultSlots,
        timezone: config.timezone,
      });

      const post = await buffer.createPost({
        text,
        channelId,
        mode,
        dueAt: dueAtIso,
        media: media as MediaAsset[] | undefined,
      });

      logPost(config.metrics_log_path, {
        channel: channelKey ?? channelId,
        postId: post.id,
        scheduledFor: post.dueAt ?? dueAtIso,
        textPreview: text,
      });

      return textResult({
        ok: true,
        post_id: post.id,
        channel: channelKey ?? channelId,
        scheduled_for: post.dueAt ?? dueAtIso ?? "next queue slot",
        mode: post.shareMode,
        status: post.status,
      });
    } catch (err) {
      return errorResult(err);
    }
  }
);

server.tool(
  "create_multi_channel_post",
  "Post the same content (or per-channel variants) to multiple channels in one call. Each entry can override text and media.",
  {
    posts: z
      .array(
        z.object({
          channel: ChannelKeySchema,
          text: z.string().min(1),
          media: z.array(MediaSchema).optional(),
        })
      )
      .min(1),
    mode: ModeSchema.default("queue"),
    due_at: z.string().optional(),
  },
  async ({ posts, mode, due_at }) => {
    const channelsCache = await buffer
      .listChannels()
      .catch(() => [] as Awaited<ReturnType<typeof buffer.listChannels>>);
    const results: unknown[] = [];

    for (const entry of posts) {
      try {
        const channelId = resolveChannelId(config, entry.channel);
        const channelKey = channelAliasFor(channelId);
        const realService = channelsCache.find((c) => c.id === channelId)?.service;

        if (realService === "instagram") {
          const hasImage = entry.media?.some((m) => m.type === "image");
          if (!hasImage) {
            results.push({
              channel: entry.channel,
              ok: false,
              error: "Instagram requires an image - skipping.",
            });
            continue;
          }
        }

        const defaultSlots = channelKey
          ? config.default_schedule[channelKey]
          : undefined;

        const dueAtIso = resolveDueAt({
          mode,
          dueAt: due_at,
          defaultSlots,
          timezone: config.timezone,
        });

        const post = await buffer.createPost({
          text: entry.text,
          channelId,
          mode,
          dueAt: dueAtIso,
          media: entry.media as MediaAsset[] | undefined,
        });

        logPost(config.metrics_log_path, {
          channel: channelKey ?? channelId,
          postId: post.id,
          scheduledFor: post.dueAt ?? dueAtIso,
          textPreview: entry.text,
        });

        results.push({
          channel: channelKey ?? channelId,
          ok: true,
          post_id: post.id,
          scheduled_for: post.dueAt ?? dueAtIso ?? "next queue slot",
        });
      } catch (err) {
        results.push({
          channel: entry.channel,
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    return textResult({ results });
  }
);

server.tool(
  "list_pending_posts",
  "List posts currently scheduled or awaiting approval in Buffer. Optionally filter by channel.",
  {
    channel: ChannelKeySchema.optional(),
  },
  async ({ channel }) => {
    try {
      const channelId = channel ? resolveChannelId(config, channel) : undefined;
      const posts = await buffer.listPendingPosts(channelId);
      return textResult({
        count: posts.length,
        posts: posts.map((p) => ({
          id: p.id,
          channel: channelAliasFor(p.channelId) ?? p.channelId,
          status: p.status,
          dueAt: p.dueAt,
          shareMode: p.shareMode,
          preview: p.text.slice(0, 80),
        })),
      });
    } catch (err) {
      return errorResult(err);
    }
  }
);

server.tool(
  "delete_post",
  "Remove a queued post from Buffer by its post ID.",
  {
    post_id: z.string().min(1),
  },
  async ({ post_id }) => {
    try {
      const result = await buffer.deletePost(post_id);
      return textResult(result);
    } catch (err) {
      return errorResult(err);
    }
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("[buffer-mcp] fatal:", err);
  process.exit(1);
});
