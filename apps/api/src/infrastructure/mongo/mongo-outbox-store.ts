import type { Collection } from 'mongodb';
import type { OutboxEvent, OutboxStore } from '../outbox/outbox-dispatcher.js';
import type { JobOutboxDocument } from './mongo-job-submission-store.js';

export class MongoOutboxStore implements OutboxStore {
  constructor(private readonly collection: Collection<JobOutboxDocument>) {}

  async claim(now: Date, lockedUntil: Date): Promise<OutboxEvent | null> {
    const document = await this.collection.findOneAndUpdate(
      {
        publishedAt: null,
        attempts: { $lt: 10 },
        $or: [{ lockedUntil: null }, { lockedUntil: { $lte: now } }],
      },
      { $set: { lockedUntil }, $inc: { attempts: 1 } },
      { sort: { createdAt: 1 }, returnDocument: 'after' },
    );
    return document
      ? {
          id: document._id,
          kind: document.kind,
          jobId: document.jobId,
          payload: document.payload,
          attempts: document.attempts,
        }
      : null;
  }

  async markPublished(id: string, publishedAt: Date): Promise<void> {
    await this.collection.updateOne(
      { _id: id, publishedAt: null },
      { $set: { publishedAt, lockedUntil: null, lastError: null } },
    );
  }

  async markFailed(id: string, retryAt: Date, message: string): Promise<void> {
    await this.collection.updateOne(
      { _id: id, publishedAt: null },
      { $set: { lockedUntil: retryAt, lastError: message } },
    );
  }
}
