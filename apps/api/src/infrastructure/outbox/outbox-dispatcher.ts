export interface OutboxEvent {
  readonly id: string;
  readonly kind: 'render_video.requested';
  readonly jobId: string;
  readonly payload: unknown;
  readonly attempts: number;
}

export interface OutboxStore {
  claim(now: Date, lockedUntil: Date): Promise<OutboxEvent | null>;
  markPublished(id: string, publishedAt: Date): Promise<void>;
  markFailed(id: string, retryAt: Date, message: string): Promise<void>;
}

export interface JobQueuePublisher {
  publish(event: OutboxEvent): Promise<void>;
}

export type DispatchResult = 'idle' | 'published' | 'failed';

export class OutboxDispatcher {
  constructor(
    private readonly store: OutboxStore,
    private readonly publisher: JobQueuePublisher,
    private readonly now: () => Date,
  ) {}

  async dispatchNext(): Promise<DispatchResult> {
    const now = this.now();
    const event = await this.store.claim(now, new Date(now.getTime() + 30_000));
    if (!event) return 'idle';
    try {
      await this.publisher.publish(event);
      await this.store.markPublished(event.id, this.now());
      return 'published';
    } catch (reason) {
      const retryDelayMs = Math.min(60_000, 1_000 * 2 ** Math.min(event.attempts, 6));
      const message =
        reason instanceof Error ? reason.message.slice(0, 500) : 'Queue publish failed';
      await this.store.markFailed(event.id, new Date(this.now().getTime() + retryDelayMs), message);
      return 'failed';
    }
  }
}
