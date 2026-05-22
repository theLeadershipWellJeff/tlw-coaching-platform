export type BufferService =
  | "instagram"
  | "facebook"
  | "twitter"
  | "linkedin"
  | "pinterest"
  | "tiktok"
  | "googlebusiness"
  | "startPage"
  | "mastodon"
  | "youtube"
  | "threads"
  | "bluesky";

export interface BufferChannel {
  id: string;
  name: string;
  displayName: string | null;
  descriptor: string;
  service: BufferService;
  serviceId: string;
  type: string;
  organizationId: string;
  timezone: string;
  isDisconnected: boolean;
  isLocked: boolean;
}

export type SchedulingMode = "queue" | "scheduled";

export type ImageMedia = {
  type: "image";
  url: string;
  altText: string;
  thumbnailUrl?: string;
};
export type VideoMedia = {
  type: "video";
  url: string;
  thumbnailUrl?: string;
  title?: string;
};
export type DocumentMedia = {
  type: "document";
  url: string;
  title: string;
  thumbnailUrl: string;
};
export type LinkMedia = {
  type: "link";
  url: string;
  title?: string;
  description?: string;
  thumbnailUrl?: string;
};
export type MediaAsset = ImageMedia | VideoMedia | DocumentMedia | LinkMedia;

export interface CreatePostInput {
  text: string;
  channelId: string;
  mode: SchedulingMode;
  dueAt?: string;
  media?: MediaAsset[];
}

export interface BufferPost {
  id: string;
  channelId: string;
  text: string;
  status: string;
  dueAt: string | null;
  createdAt: string;
  shareMode: string;
}

export interface BufferOrganization {
  id: string;
  name: string;
}

export interface GraphQLError {
  message: string;
  path?: (string | number)[];
  extensions?: Record<string, unknown>;
}
