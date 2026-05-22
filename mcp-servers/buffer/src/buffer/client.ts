import type {
  BufferChannel,
  BufferPost,
  CreatePostInput,
  GraphQLError,
} from "./types.js";

const BUFFER_GRAPHQL_ENDPOINT = "https://api.buffer.com/graphql";

export class BufferApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly errors?: GraphQLError[]
  ) {
    super(message);
    this.name = "BufferApiError";
  }
}

export class BufferClient {
  constructor(private readonly apiKey: string) {
    if (!apiKey) throw new Error("BufferClient requires an API key");
  }

  async query<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
    let lastErr: unknown;
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const res = await fetch(BUFFER_GRAPHQL_ENDPOINT, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify({ query, variables }),
        });

        if (res.status === 429 || (res.status >= 500 && res.status < 600)) {
          throw new BufferApiError(
            `Buffer API transient error ${res.status}`,
            res.status
          );
        }

        const json = (await res.json()) as {
          data?: T;
          errors?: GraphQLError[];
        };

        if (json.errors && json.errors.length) {
          throw new BufferApiError(
            json.errors.map((e) => e.message).join("; "),
            res.status,
            json.errors
          );
        }
        if (!json.data) {
          throw new BufferApiError("Buffer API returned no data", res.status);
        }
        return json.data;
      } catch (err) {
        lastErr = err;
        const transient =
          err instanceof BufferApiError &&
          (err.status === 429 || (err.status ?? 0) >= 500);
        if (!transient) throw err;
        const backoffMs = 2000 * Math.pow(2, attempt);
        await new Promise((r) => setTimeout(r, backoffMs));
      }
    }
    throw lastErr instanceof Error
      ? lastErr
      : new BufferApiError("Buffer API failed after retries");
  }

  async listChannels(): Promise<BufferChannel[]> {
    const query = /* GraphQL */ `
      query ListChannels {
        channels {
          id
          name
          service
          serviceUsername
          serviceType
        }
      }
    `;
    const data = await this.query<{ channels: BufferChannel[] }>(query);
    return data.channels;
  }

  async createPost(input: CreatePostInput): Promise<BufferPost> {
    const mode = input.mode === "queue" ? "addToQueue" : "customScheduled";
    const schedulingType = input.mode === "queue" ? "queue" : "scheduled";

    const variables: Record<string, unknown> = {
      input: {
        text: input.text,
        channelId: input.channelId,
        schedulingType,
        mode,
        ...(input.dueAt ? { dueAt: input.dueAt } : {}),
        ...(input.media && input.media.length
          ? {
              assets: input.media.map((m) => ({
                url: m.url,
                ...(m.mimeType ? { mimeType: m.mimeType } : {}),
                ...(m.altText ? { altText: m.altText } : {}),
              })),
            }
          : {}),
      },
    };

    const mutation = /* GraphQL */ `
      mutation CreatePost($input: CreatePostInput!) {
        createPost(input: $input) {
          ... on PostCreated {
            post {
              id
              channelId
              text
              status
              dueAt
              createdAt
            }
          }
          ... on UserError {
            message
            field
          }
        }
      }
    `;

    const data = await this.query<{
      createPost: {
        post?: BufferPost;
        message?: string;
        field?: string;
      };
    }>(mutation, variables);

    if (!data.createPost.post) {
      throw new BufferApiError(
        data.createPost.message ?? "createPost returned no post"
      );
    }
    return data.createPost.post;
  }

  async listPendingPosts(channelId?: string): Promise<BufferPost[]> {
    const query = /* GraphQL */ `
      query PendingPosts($channelId: String) {
        posts(status: "pending", channelId: $channelId) {
          id
          channelId
          text
          status
          dueAt
          createdAt
        }
      }
    `;
    const data = await this.query<{ posts: BufferPost[] }>(query, {
      channelId: channelId ?? null,
    });
    return data.posts;
  }

  async deletePost(postId: string): Promise<{ id: string; deleted: boolean }> {
    const mutation = /* GraphQL */ `
      mutation DeletePost($id: String!) {
        deletePost(input: { id: $id }) {
          ... on PostDeleted {
            id
          }
          ... on UserError {
            message
            field
          }
        }
      }
    `;
    const data = await this.query<{
      deletePost: { id?: string; message?: string };
    }>(mutation, { id: postId });

    if (!data.deletePost.id) {
      throw new BufferApiError(
        data.deletePost.message ?? "deletePost returned no id"
      );
    }
    return { id: data.deletePost.id, deleted: true };
  }
}
