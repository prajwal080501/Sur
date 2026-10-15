import {
  CopyObjectCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
  type S3Client,
} from '@aws-sdk/client-s3';
import type { PublicShareMediaStore } from '@sur/share-domain';

export type S3Sender = Pick<S3Client, 'send'>;

function copySource(bucket: string, key: string): string {
  return `${encodeURIComponent(bucket)}/${key.split('/').map(encodeURIComponent).join('/')}`;
}

function extension(key: string, fallback: string): string {
  const match = key.match(/\.([A-Za-z0-9]{1,8})$/);
  return match?.[1]?.toLowerCase() ?? fallback;
}

export class S3PublicShareMediaStore implements PublicShareMediaStore {
  readonly #publicBaseUrl: URL;

  constructor(
    private readonly client: S3Sender,
    private readonly bucket: string,
    publicBaseUrl: string,
  ) {
    if (!bucket) throw new TypeError('Public media bucket is required');
    this.#publicBaseUrl = new URL(publicBaseUrl);
    if (this.#publicBaseUrl.protocol !== 'https:') {
      throw new TypeError('Public media URL must use HTTPS');
    }
  }

  async publish(input: {
    readonly slug: string;
    readonly audioObjectKey: string;
    readonly videoObjectKey: string | null;
  }): Promise<{ readonly audioUrl: string; readonly videoUrl: string | null }> {
    const prefix = `public-shares/${input.slug}/`;
    const audioKey = `${prefix}audio.${extension(input.audioObjectKey, 'mp3')}`;
    await this.client.send(
      new CopyObjectCommand({
        Bucket: this.bucket,
        Key: audioKey,
        CopySource: copySource(this.bucket, input.audioObjectKey),
        ContentType: extension(input.audioObjectKey, 'mp3') === 'mp3' ? 'audio/mpeg' : undefined,
        MetadataDirective: 'REPLACE',
      }),
    );
    let videoKey: string | null = null;
    if (input.videoObjectKey) {
      videoKey = `${prefix}video.${extension(input.videoObjectKey, 'mp4')}`;
      await this.client.send(
        new CopyObjectCommand({
          Bucket: this.bucket,
          Key: videoKey,
          CopySource: copySource(this.bucket, input.videoObjectKey),
          ContentType: 'video/mp4',
          MetadataDirective: 'REPLACE',
        }),
      );
    }
    return {
      audioUrl: new URL(audioKey, this.#publicBaseUrl).toString(),
      videoUrl: videoKey ? new URL(videoKey, this.#publicBaseUrl).toString() : null,
    };
  }

  async remove(slug: string): Promise<void> {
    const prefix = `public-shares/${slug}/`;
    let continuationToken: string | undefined;
    do {
      const listed = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: prefix,
          ...(continuationToken ? { ContinuationToken: continuationToken } : {}),
        }),
      );
      const objects = (listed.Contents ?? []).flatMap(({ Key }) => (Key ? [{ Key }] : []));
      if (objects.length > 0) {
        await this.client.send(
          new DeleteObjectsCommand({
            Bucket: this.bucket,
            Delete: { Objects: objects, Quiet: true },
          }),
        );
      }
      continuationToken = listed.IsTruncated ? listed.NextContinuationToken : undefined;
    } while (continuationToken);
  }
}
