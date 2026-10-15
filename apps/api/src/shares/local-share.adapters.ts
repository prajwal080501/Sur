import type { TakeJobCatalog } from '@sur/job-domain';
import type { PublicShareMediaStore, ShareableTake, TakeShareCatalog } from '@sur/share-domain';

export class InMemoryTakeShareCatalog implements TakeShareCatalog, TakeJobCatalog {
  readonly #takes = new Map<string, ShareableTake>();

  upsert(take: ShareableTake): void {
    this.#takes.set(take.id, take);
  }

  findOwned(takeId: string, ownerId: string): Promise<ShareableTake | null> {
    const take = this.#takes.get(takeId);
    return Promise.resolve(take?.ownerId === ownerId ? take : null);
  }
}

export class LocalPublicShareMediaStore implements PublicShareMediaStore {
  readonly #published = new Set<string>();
  readonly #mediaBaseUrl: URL;

  constructor(mediaBaseUrl: string) {
    this.#mediaBaseUrl = new URL(mediaBaseUrl);
    if (!['http:', 'https:'].includes(this.#mediaBaseUrl.protocol)) {
      throw new TypeError('Public media base URL must use HTTP or HTTPS');
    }
  }

  publish(input: {
    readonly slug: string;
    readonly audioObjectKey: string;
    readonly videoObjectKey: string | null;
  }): Promise<{ readonly audioUrl: string; readonly videoUrl: string | null }> {
    this.#published.add(input.slug);
    return Promise.resolve({
      audioUrl: new URL(`${input.slug}/audio`, this.#mediaBaseUrl).toString(),
      videoUrl: input.videoObjectKey
        ? new URL(`${input.slug}/video`, this.#mediaBaseUrl).toString()
        : null,
    });
  }

  remove(slug: string): Promise<void> {
    this.#published.delete(slug);
    return Promise.resolve();
  }
}
