import { GetObjectCommand, type S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { JobOutputKeys, JobOutputUrlResolver } from '@sur/job-domain';

export class S3JobOutputUrlResolver implements JobOutputUrlResolver {
  constructor(
    private readonly client: S3Client,
    private readonly bucket: string,
  ) {}

  private resolveKey(key: string): Promise<string> {
    return getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: key }), {
      expiresIn: 15 * 60,
    });
  }

  async resolve(keys: JobOutputKeys) {
    const [videoUrl, posterUrl] = await Promise.all([
      this.resolveKey(keys.videoObjectKey),
      keys.posterObjectKey ? this.resolveKey(keys.posterObjectKey) : Promise.resolve(null),
    ]);
    return { videoUrl, posterUrl };
  }
}
