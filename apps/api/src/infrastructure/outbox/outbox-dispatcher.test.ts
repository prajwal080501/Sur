import { describe, expect, it, vi } from 'vitest';
import {
  OutboxDispatcher,
  type JobQueuePublisher,
  type OutboxEvent,
  type OutboxStore,
} from './outbox-dispatcher.js';

const now = new Date('2026-10-15T10:00:00.000Z');
const event: OutboxEvent = {
  id: 'job:job-1',
  kind: 'render_video.requested',
  jobId: 'job-1',
  payload: { inputKeys: ['private/mix.mp3'] },
  attempts: 1,
};

function setup(claimed: OutboxEvent | null = event) {
  const claim = vi.fn(() => Promise.resolve(claimed));
  const markPublished = vi.fn(() => Promise.resolve());
  const markFailed = vi.fn(() => Promise.resolve());
  const publish = vi.fn(() => Promise.resolve());
  const store: OutboxStore = {
    claim,
    markPublished,
    markFailed,
  };
  const publisher: JobQueuePublisher = { publish };
  return {
    dispatcher: new OutboxDispatcher(store, publisher, () => now),
    claim,
    markPublished,
    markFailed,
    publish,
  };
}

describe('OutboxDispatcher', () => {
  it('claims, publishes, and acknowledges one event', async () => {
    const { dispatcher, claim, markPublished, markFailed, publish } = setup();
    await expect(dispatcher.dispatchNext()).resolves.toBe('published');
    expect(claim).toHaveBeenCalledWith(now, new Date('2026-10-15T10:00:30.000Z'));
    expect(publish).toHaveBeenCalledWith(event);
    expect(markPublished).toHaveBeenCalledWith(event.id, now);
    expect(markFailed).not.toHaveBeenCalled();
  });

  it('backs off a failed publish and keeps the event retryable', async () => {
    const { dispatcher, markPublished, markFailed, publish } = setup();
    publish.mockRejectedValueOnce(new Error('SQS unavailable'));
    await expect(dispatcher.dispatchNext()).resolves.toBe('failed');
    expect(markFailed).toHaveBeenCalledWith(
      event.id,
      new Date('2026-10-15T10:00:02.000Z'),
      'SQS unavailable',
    );
    expect(markPublished).not.toHaveBeenCalled();
  });

  it('does nothing when no event is claimable', async () => {
    const { dispatcher, publish } = setup(null);
    await expect(dispatcher.dispatchNext()).resolves.toBe('idle');
    expect(publish).not.toHaveBeenCalled();
  });
});
