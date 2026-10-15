import { CopyObjectCommand, DeleteObjectsCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { describe, expect, it, vi } from 'vitest';
import { S3PublicShareMediaStore } from './s3-public-share-media-store.js';

describe('S3PublicShareMediaStore', () => {
  it('copies only existing private objects into a slug-scoped public prefix', async () => {
    const send = vi.fn((command: unknown) => Promise.resolve(command));
    const store = new S3PublicShareMediaStore({ send }, 'sur-media', 'https://media.sur.test/');
    await expect(
      store.publish({
        slug: 'safe_slug1',
        audioObjectKey: 'private/user 1/mix.mp3',
        videoObjectKey: 'private/user 1/video.mp4',
      }),
    ).resolves.toEqual({
      audioUrl: 'https://media.sur.test/public-shares/safe_slug1/audio.mp3',
      videoUrl: 'https://media.sur.test/public-shares/safe_slug1/video.mp4',
    });
    const commands = send.mock.calls.map(([command]) => command);
    expect(commands).toHaveLength(2);
    expect(commands[0]).toBeInstanceOf(CopyObjectCommand);
    expect((commands[0] as CopyObjectCommand).input).toMatchObject({
      Bucket: 'sur-media',
      Key: 'public-shares/safe_slug1/audio.mp3',
      CopySource: 'sur-media/private/user%201/mix.mp3',
    });
    expect((commands[1] as CopyObjectCommand).input.Key).toBe('public-shares/safe_slug1/video.mp4');
  });

  it('deletes every paginated object under the share prefix', async () => {
    const send = vi.fn((command: unknown) => {
      if (command instanceof ListObjectsV2Command) {
        return Promise.resolve(
          command.input.ContinuationToken
            ? { Contents: [{ Key: 'public-shares/abcdefgh/video.mp4' }], IsTruncated: false }
            : {
                Contents: [{ Key: 'public-shares/abcdefgh/audio.mp3' }],
                IsTruncated: true,
                NextContinuationToken: 'page-2',
              },
        );
      }
      return Promise.resolve({});
    });
    const store = new S3PublicShareMediaStore({ send }, 'sur-media', 'https://media.sur.test/');
    await store.remove('abcdefgh');
    const commands = send.mock.calls.map(([command]) => command);
    expect(commands.filter((command) => command instanceof ListObjectsV2Command)).toHaveLength(2);
    const deletes = commands.filter(
      (command): command is DeleteObjectsCommand => command instanceof DeleteObjectsCommand,
    );
    expect(deletes.map((command) => command.input.Delete?.Objects?.[0]?.Key)).toEqual([
      'public-shares/abcdefgh/audio.mp3',
      'public-shares/abcdefgh/video.mp4',
    ]);
  });

  it('refuses non-HTTPS public media origins', () => {
    expect(
      () => new S3PublicShareMediaStore({ send: vi.fn() }, 'sur-media', 'http://media.sur.test/'),
    ).toThrow('must use HTTPS');
  });
});
