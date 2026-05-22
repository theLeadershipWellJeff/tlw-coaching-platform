export interface BufferChannel {
  id: string;
  name: string;
  service: string;
  serviceUsername?: string;
  serviceType?: string;
}

export type SchedulingMode = "queue" | "scheduled";

export interface MediaAsset {
  url: string;
  mimeType?: string;
  altText?: string;
}

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
  dueAt?: string;
  createdAt?: string;
}

export interface GraphQLError {
  message: string;
  path?: (string | number)[];
  extensions?: Record<string, unknown>;
}
