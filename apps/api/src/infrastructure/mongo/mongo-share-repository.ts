import type { PublicShare } from '@sur/shared-types';
import type { ShareRecord, ShareRepository } from '@sur/share-domain';
import { MongoServerError, type Collection } from 'mongodb';

interface ShareDocument {
  readonly _id: string;
  readonly ownerId: string;
  readonly takeId: string;
  readonly visibility: ShareRecord['visibility'];
  readonly expiresAt: Date | null;
  readonly createdAt: Date;
  readonly state: ShareRecord['state'];
  readonly revokedAt: Date | null;
  readonly publicData: PublicShare | null;
}

function toRecord(document: ShareDocument): ShareRecord {
  return {
    slug: document._id,
    ownerId: document.ownerId,
    takeId: document.takeId,
    visibility: document.visibility,
    expiresAt: document.expiresAt,
    createdAt: document.createdAt,
    state: document.state,
    revokedAt: document.revokedAt,
    publicData: document.publicData,
  };
}

export class MongoShareRepository implements ShareRepository {
  constructor(private readonly collection: Collection<ShareDocument>) {}

  async reserve(record: ShareRecord): Promise<boolean> {
    try {
      await this.collection.insertOne({
        _id: record.slug,
        ownerId: record.ownerId,
        takeId: record.takeId,
        visibility: record.visibility,
        expiresAt: record.expiresAt,
        createdAt: record.createdAt,
        state: record.state,
        revokedAt: record.revokedAt,
        publicData: record.publicData,
      });
      return true;
    } catch (reason) {
      if (reason instanceof MongoServerError && reason.code === 11000) return false;
      throw reason;
    }
  }

  async activate(slug: string, publicData: PublicShare): Promise<void> {
    const result = await this.collection.updateOne(
      { _id: slug, state: 'provisioning', revokedAt: null },
      { $set: { state: 'active', publicData } },
    );
    if (result.matchedCount !== 1) throw new Error('Share reservation does not exist');
  }

  async releaseReservation(slug: string, ownerId: string): Promise<void> {
    await this.collection.deleteOne({ _id: slug, ownerId, state: 'provisioning' });
  }

  async findBySlug(slug: string): Promise<ShareRecord | null> {
    const document = await this.collection.findOne({ _id: slug });
    return document ? toRecord(document) : null;
  }

  async revoke(slug: string, ownerId: string, revokedAt: Date): Promise<boolean> {
    const result = await this.collection.updateOne({ _id: slug, ownerId }, { $set: { revokedAt } });
    return result.matchedCount === 1;
  }
}
