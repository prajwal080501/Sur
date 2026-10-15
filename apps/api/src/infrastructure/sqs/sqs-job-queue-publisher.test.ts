import { SendMessageCommand } from '@aws-sdk/client-sqs';
import { describe, expect, it, vi } from 'vitest';
import type { OutboxEvent } from '../outbox/outbox-dispatcher.js';
import { SqsJobQueuePublisher } from './sqs-job-queue-publisher.js';

const event: OutboxEvent = {
  id: 'job:job-1',
  kind: 'render_video.requested',
  jobId: 'job-1',
  payload: { inputKeys: ['private/mix.mp3'] },
  attempts: 1,
};

describe('SqsJobQueuePublisher', () => {
  it('publishes a stable event envelope with its idempotency id', async () => {
    const send = vi.fn((command: unknown) => Promise.resolve(command));
    const publisher = new SqsJobQueuePublisher(
      { send },
      'https://sqs.ap-south-1.amazonaws.com/123/sur-jobs',
    );
    await publisher.publish(event);
    const command = send.mock.calls[0]?.[0];
    expect(command).toBeInstanceOf(SendMessageCommand);
    const input = (command as SendMessageCommand).input;
    expect(JSON.parse(input.MessageBody ?? '') as unknown).toEqual({
      id: 'job:job-1',
      type: 'render_video.requested',
      jobId: 'job-1',
      payload: { inputKeys: ['private/mix.mp3'] },
    });
    expect(input.MessageAttributes?.eventType?.StringValue).toBe('render_video.requested');
  });

  it('refuses a non-HTTPS queue URL', () => {
    expect(
      () => new SqsJobQueuePublisher({ send: vi.fn() }, 'http://localhost:4566/queue/sur-jobs'),
    ).toThrow('must use HTTPS');
  });

  it('allows HTTP only for explicitly enabled loopback emulators', () => {
    expect(
      () =>
        new SqsJobQueuePublisher({ send: vi.fn() }, 'http://127.0.0.1:4566/queue/sur-jobs', {
          allowInsecureLocalhost: true,
        }),
    ).not.toThrow();
    expect(
      () =>
        new SqsJobQueuePublisher({ send: vi.fn() }, 'http://emulator.example/queue/sur-jobs', {
          allowInsecureLocalhost: true,
        }),
    ).toThrow('must use HTTPS');
  });
});
