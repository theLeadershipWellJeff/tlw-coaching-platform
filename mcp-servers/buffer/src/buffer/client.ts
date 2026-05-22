import type {
  BufferChannel,
  BufferOrganization,
  BufferPost,
  CreatePostInput,
  GraphQLError,
  MediaAsset,
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

function toAssetInput(media: MediaAsset) {
  switch (media.type) {
    case "image":
      return {
        image: {
          url: media.url,
          ...(media.thumbnailUrl ? { thumbnailUrl: media.thumbnailUrl } : {}),
          metadata: { altText: media.altText },
        },
      };
    case "video":
      return {
        video: {
          url: media.url,
          ...(media.thumbnailUrl ? { thumbnailUrl: media.thumbnailUrl } : {}),
          ...(media.title ? { metadata: { title: media.title } } : {}),
        },
      };
    case "document":
      return {
        document: {
          url: media.url,
          title: media.title,
          thumbnailUrl: media.thumbnailUrl,
        },
      };
    case "link":
      return {
        link: {
          url: media.url,
          ...(media.title ? { title: media.title } : {}),
          ...(media.description ? { description: media.description } : {}),
          ...(media.thumbnailUrl ? { thumbnailUrl: media.thumbnailUrl } : {}),
        },
      };
  }
}

export class BufferClient {
  private cachedOrgId?: string;

  constructor(
    private readonly apiKey: string,
    organizationId?: string
  ) {
    if (!apiKey) throw new Error("BufferClient requires an API key");
    if (organizationId) this.cachedOrgId = organizationId;
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

  async getOrganizations(): Promise<BufferOrganization[]> {
    const query = /* GraphQL */ `
      query GetOrganizations {
        account {
          organizations {
            id
            name
          }
        }
      }
    `;
    const data = await this.query<{
      account: { organizations: BufferOrganization[] };
    }>(query);
    return data.account.organizations;
  }

  async getOrganizationId(): Promise<string> {
    if (this.cachedOrgId) return this.cachedOrgId;
    const orgs = await this.getOrganizations();
    if (orgs.length === 0) {
      throw new BufferApiError(
        "No Buffer organizations found on this account."
      );
    }
    this.cachedOrgId = orgs[0].id;
    return this.cachedOrgId;
  }

  async listChannels(): Promise<BufferChannel[]> {
    const organizationId = await this.getOrganizationId();
    const query = /* GraphQL */ `
      query ListChannels($input: ChannelsInput!) {
        channels(input: $input) {
          id
          name
          displayName
          descriptor
          service
          serviceId
          type
          organizationId
          timezone
          isDisconnected
          isLocked
        }
      }
    `;
    const data = await this.query<{ channels: BufferChannel[] }>(query, {
      input: { organizationId },
    });
    return data.channels;
  }

  async createPost(input: CreatePostInput): Promise<BufferPost> {
    const mode = input.mode === "queue" ? "addToQueue" : "customScheduled";

    const variables: Record<string, unknown> = {
      input: {
        text: input.text,
        channelId: input.channelId,
        schedulingType: "automatic",
        mode,
        assets: (input.media ?? []).map(toAssetInput),
        ...(input.dueAt ? { dueAt: input.dueAt } : {}),
      },
    };

    const mutation = /* GraphQL */ `
      mutation CreatePost($input: CreatePostInput!) {
        createPost(input: $input) {
          ... on PostActionSuccess {
            post {
              id
              channelId
              text
              status
              dueAt
              createdAt
              shareMode
            }
          }
          ... on InvalidInputError {
            message
          }
        }
      }
    `;

    const data = await this.query<{
      createPost: { post?: BufferPost; message?: string };
    }>(mutation, variables);

    if (!data.createPost.post) {
      throw new BufferApiError(
        data.createPost.message ?? "createPost returned no post"
      );
    }
    return data.createPost.post;
  }

  async listPendingPosts(channelId?: string): Promise<BufferPost[]> {
    const organizationId = await this.getOrganizationId();
    const query = /* GraphQL */ `
      query PendingPosts($input: PostsInput!, $first: Int) {
        posts(input: $input, first: $first) {
          edges {
            node {
              id
              channelId
              text
              status
              dueAt
              createdAt
              shareMode
            }
          }
        }
      }
    `;
    const data = await this.query<{
      posts: { edges: { node: BufferPost }[] };
    }>(query, {
      input: {
        organizationId,
        filter: {
          status: ["scheduled", "needs_approval"],
          ...(channelId ? { channelIds: [channelId] } : {}),
        },
        sort: [{ field: "dueAt", direction: "asc" }],
      },
      first: 100,
    });
    return data.posts.edges.map((e) => e.node);
  }

  async deletePost(postId: string): Promise<{ id: string; deleted: boolean }> {
    const mutation = /* GraphQL */ `
      mutation DeletePost($input: DeletePostInput!) {
        deletePost(input: $input) {
          ... on DeletePostSuccess {
            id
          }
          ... on InvalidInputError {
            message
          }
        }
      }
    `;
    const data = await this.query<{
      deletePost: { id?: string; message?: string };
    }>(mutation, { input: { id: postId } });

    if (!data.deletePost.id) {
      throw new BufferApiError(
        data.deletePost.message ?? "deletePost returned no id"
      );
    }
    return { id: data.deletePost.id, deleted: true };
  }
}
