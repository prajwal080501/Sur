import type {
  ChordEvent,
  CreateShareRequest,
  CreateShareResponse,
  PublicShare,
  ShareVisibility,
} from '@sur/shared-types';

export type ShareErrorCode =
  | 'TAKE_NOT_FOUND'
  | 'TAKE_NOT_CLOUD_READY'
  | 'STEMS_NOT_SHAREABLE'
  | 'INVALID_EXPIRY'
  | 'SHARE_NOT_FOUND'
  | 'SHARE_GONE'
  | 'SHARE_SLUG_EXHAUSTED';

export class ShareError extends Error {
  constructor(
    readonly code: ShareErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ShareError';
  }
}

export interface ShareableTake {
  readonly id: string;
  readonly ownerId: string;
  readonly title: string;
  readonly singer: string;
  readonly key: string;
  readonly tempoBpm: number;
  readonly chords: readonly ChordEvent[];
  readonly audioObjectKey: string | null;
  readonly videoObjectKey: string | null;
  readonly containsThirdPartyStems: boolean;
}

export interface ShareRecord {
  readonly slug: string;
  readonly ownerId: string;
  readonly takeId: string;
  readonly visibility: ShareVisibility;
  readonly expiresAt: Date | null;
  readonly createdAt: Date;
  readonly state: 'provisioning' | 'active';
  readonly revokedAt: Date | null;
  readonly publicData: PublicShare | null;
}

export interface TakeShareCatalog {
  findOwned(takeId: string, ownerId: string): Promise<ShareableTake | null>;
}

export interface ShareRepository {
  reserve(record: ShareRecord): Promise<boolean>;
  activate(slug: string, publicData: PublicShare): Promise<void>;
  releaseReservation(slug: string, ownerId: string): Promise<void>;
  findBySlug(slug: string): Promise<ShareRecord | null>;
  revoke(slug: string, ownerId: string, revokedAt: Date): Promise<boolean>;
}

export interface PublicShareMediaStore {
  publish(input: {
    readonly slug: string;
    readonly audioObjectKey: string;
    readonly videoObjectKey: string | null;
  }): Promise<{ readonly audioUrl: string; readonly videoUrl: string | null }>;
  remove(slug: string): Promise<void>;
}

export interface ShareServiceDependencies {
  readonly takes: TakeShareCatalog;
  readonly shares: ShareRepository;
  readonly media: PublicShareMediaStore;
  readonly nextSlug: () => string;
  readonly now: () => Date;
  readonly publicBaseUrl: string;
}

export class ShareService {
  readonly #publicBaseUrl: URL;

  constructor(private readonly dependencies: ShareServiceDependencies) {
    this.#publicBaseUrl = new URL(dependencies.publicBaseUrl);
    if (!['http:', 'https:'].includes(this.#publicBaseUrl.protocol)) {
      throw new TypeError('Public share base URL must use HTTP or HTTPS');
    }
  }

  async create(ownerId: string, input: CreateShareRequest): Promise<CreateShareResponse> {
    const now = this.dependencies.now();
    const expiresAt = input.expiresAt === null ? null : new Date(input.expiresAt);
    if (expiresAt && (!Number.isFinite(expiresAt.getTime()) || expiresAt <= now)) {
      throw new ShareError('INVALID_EXPIRY', 'Share expiry must be in the future');
    }
    const take = await this.dependencies.takes.findOwned(input.takeId, ownerId);
    if (!take) throw new ShareError('TAKE_NOT_FOUND', 'Take was not found');
    if (take.containsThirdPartyStems) {
      throw new ShareError('STEMS_NOT_SHAREABLE', 'Third-party stems cannot be shared');
    }
    if (!take.audioObjectKey) {
      throw new ShareError(
        'TAKE_NOT_CLOUD_READY',
        'Save the mixed track to cloud storage before sharing',
      );
    }

    const slug = await this.#reserveSlug(ownerId, input, now, expiresAt);
    try {
      const media = await this.dependencies.media.publish({
        slug,
        audioObjectKey: take.audioObjectKey,
        videoObjectKey: input.includeVideo ? take.videoObjectKey : null,
      });
      await this.dependencies.shares.activate(slug, {
        title: take.title,
        singer: take.singer,
        key: take.key,
        tempoBpm: take.tempoBpm,
        audioUrl: media.audioUrl,
        videoUrl: media.videoUrl,
        chords: [...take.chords],
      });
    } catch (reason) {
      await this.dependencies.media.remove(slug).catch(() => undefined);
      await this.dependencies.shares.releaseReservation(slug, ownerId);
      throw reason;
    }
    return {
      slug,
      url: new URL(`/s/${slug}`, this.#publicBaseUrl).toString(),
    };
  }

  async resolve(slug: string): Promise<PublicShare> {
    const share = await this.dependencies.shares.findBySlug(slug);
    if (!share) throw new ShareError('SHARE_NOT_FOUND', 'Share was not found');
    if (
      share.state !== 'active' ||
      share.revokedAt !== null ||
      (share.expiresAt !== null && share.expiresAt <= this.dependencies.now())
    ) {
      throw new ShareError('SHARE_GONE', 'Share was revoked or expired');
    }
    if (!share.publicData) throw new ShareError('SHARE_GONE', 'Share is not available');
    return share.publicData;
  }

  async revoke(ownerId: string, slug: string): Promise<void> {
    const revoked = await this.dependencies.shares.revoke(slug, ownerId, this.dependencies.now());
    if (!revoked) throw new ShareError('SHARE_NOT_FOUND', 'Share was not found');
    await this.dependencies.media.remove(slug);
  }

  async #reserveSlug(
    ownerId: string,
    input: CreateShareRequest,
    createdAt: Date,
    expiresAt: Date | null,
  ): Promise<string> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const slug = this.dependencies.nextSlug();
      if (!/^[A-Za-z0-9_-]{8,32}$/.test(slug)) continue;
      const reserved = await this.dependencies.shares.reserve({
        slug,
        ownerId,
        takeId: input.takeId,
        visibility: input.visibility,
        expiresAt,
        createdAt,
        state: 'provisioning',
        revokedAt: null,
        publicData: null,
      });
      if (reserved) return slug;
    }
    throw new ShareError('SHARE_SLUG_EXHAUSTED', 'Unable to allocate a unique share link');
  }
}
