import type { CreateShareRequest } from '@sur/shared-types';
import { describe, expect, it, vi } from 'vitest';
import { InMemoryShareRepository } from './in-memory-share-repository.js';
import {
  ShareService,
  type PublicShareMediaStore,
  type ShareError,
  type ShareableTake,
  type TakeShareCatalog,
} from './share-service.js';

const now = new Date('2026-10-14T10:00:00.000Z');
const request: CreateShareRequest = {
  takeId: 'take-1',
  visibility: 'unlisted',
  includeVideo: false,
  expiresAt: null,
};

function take(overrides: Partial<ShareableTake> = {}): ShareableTake {
  return {
    id: 'take-1',
    ownerId: 'user-1',
    title: 'Morning riyaz',
    singer: 'Asha',
    key: 'A minor',
    tempoBpm: 90,
    chords: [],
    audioObjectKey: 'private/user-1/take-1/mix.wav',
    videoObjectKey: 'private/user-1/take-1/video.mp4',
    containsThirdPartyStems: false,
    ...overrides,
  };
}

function setup(source = take(), slugs = ['abcdefghij']) {
  const shares = new InMemoryShareRepository();
  const takes: TakeShareCatalog = {
    findOwned: vi.fn((takeId, ownerId) =>
      Promise.resolve(takeId === source.id && ownerId === source.ownerId ? source : null),
    ),
  };
  const publishMock = vi.fn(({ slug, videoObjectKey }) =>
    Promise.resolve({
      audioUrl: `https://media.sur.test/${slug}/mix.mp3`,
      videoUrl: videoObjectKey ? `https://media.sur.test/${slug}/video.mp4` : null,
    }),
  );
  const removeMock = vi.fn(() => Promise.resolve());
  const media: PublicShareMediaStore = {
    publish: publishMock,
    remove: removeMock,
  };
  let slugIndex = 0;
  const service = new ShareService({
    takes,
    shares,
    media,
    nextSlug: () => slugs[slugIndex++] ?? 'fallback12',
    now: () => now,
    publicBaseUrl: 'https://sur.test',
  });
  return { service, shares, takes, media, publishMock, removeMock };
}

describe('ShareService', () => {
  it('publishes only an existing cloud mix and activates a public projection', async () => {
    const { service, publishMock } = setup();
    await expect(service.create('user-1', request)).resolves.toEqual({
      slug: 'abcdefghij',
      url: 'https://sur.test/s/abcdefghij',
    });
    expect(publishMock).toHaveBeenCalledWith({
      slug: 'abcdefghij',
      audioObjectKey: 'private/user-1/take-1/mix.wav',
      videoObjectKey: null,
    });
    await expect(service.resolve('abcdefghij')).resolves.toMatchObject({
      title: 'Morning riyaz',
      singer: 'Asha',
      audioUrl: 'https://media.sur.test/abcdefghij/mix.mp3',
      videoUrl: null,
    });
  });

  it('rejects local-only takes before media publication', async () => {
    const { service, publishMock } = setup(take({ audioObjectKey: null }));
    await expect(service.create('user-1', request)).rejects.toMatchObject({
      code: 'TAKE_NOT_CLOUD_READY',
    });
    expect(publishMock).not.toHaveBeenCalled();
  });

  it('blocks projects containing third-party stems', async () => {
    const { service, publishMock } = setup(take({ containsThirdPartyStems: true }));
    await expect(service.create('user-1', request)).rejects.toMatchObject({
      code: 'STEMS_NOT_SHAREABLE',
    });
    expect(publishMock).not.toHaveBeenCalled();
  });

  it('retries atomic slug collisions before publishing', async () => {
    const { service, shares, publishMock } = setup(take(), ['collision1', 'unique1234']);
    await shares.reserve({
      slug: 'collision1',
      ownerId: 'other',
      takeId: 'other-take',
      visibility: 'public',
      expiresAt: null,
      createdAt: now,
      state: 'provisioning',
      revokedAt: null,
      publicData: null,
    });
    await expect(service.create('user-1', request)).resolves.toMatchObject({ slug: 'unique1234' });
    expect(publishMock).toHaveBeenCalledTimes(1);
  });

  it('returns gone after expiry or owner revocation and removes public media', async () => {
    const expiry = '2026-10-14T11:00:00.000Z';
    const clock = { current: now };
    const configured = setup();
    const service = new ShareService({
      takes: configured.takes,
      shares: configured.shares,
      media: configured.media,
      nextSlug: () => 'expiring12',
      now: () => clock.current,
      publicBaseUrl: 'https://sur.test',
    });
    await service.create('user-1', { ...request, expiresAt: expiry });
    clock.current = new Date(expiry);
    await expect(service.resolve('expiring12')).rejects.toEqual(
      expect.objectContaining<Partial<ShareError>>({ code: 'SHARE_GONE' }),
    );
    clock.current = now;
    await service.revoke('user-1', 'expiring12');
    expect(configured.removeMock).toHaveBeenCalledWith('expiring12');
    await expect(service.resolve('expiring12')).rejects.toMatchObject({ code: 'SHARE_GONE' });
  });

  it('cleans up its reservation and copied media when activation fails', async () => {
    const configured = setup();
    vi.spyOn(configured.shares, 'activate').mockRejectedValueOnce(
      new Error('database unavailable'),
    );
    await expect(configured.service.create('user-1', request)).rejects.toThrow(
      'database unavailable',
    );
    expect(configured.removeMock).toHaveBeenCalledWith('abcdefghij');
    await expect(configured.shares.findBySlug('abcdefghij')).resolves.toBeNull();
  });

  it('rejects an invalid public base URL before any publication can occur', () => {
    const configured = setup();
    expect(
      () =>
        new ShareService({
          takes: configured.takes,
          shares: configured.shares,
          media: configured.media,
          nextSlug: () => 'abcdefghij',
          now: () => now,
          publicBaseUrl: 'file:///private/share',
        }),
    ).toThrow('Public share base URL must use HTTP or HTTPS');
    expect(configured.publishMock).not.toHaveBeenCalled();
  });

  it('never reserves or publishes unsafe generated slugs', async () => {
    const configured = setup(take(), ['../unsafe', 'short', 'has spaces']);
    const reserve = vi.spyOn(configured.shares, 'reserve');
    await expect(configured.service.create('user-1', request)).rejects.toMatchObject({
      code: 'SHARE_SLUG_EXHAUSTED',
    });
    expect(reserve).not.toHaveBeenCalled();
    expect(configured.publishMock).not.toHaveBeenCalled();
  });
});
