import { SendMessageCommand, type SQSClient } from '@aws-sdk/client-sqs';
import type { JobQueuePublisher, OutboxEvent } from '../outbox/outbox-dispatcher.js';

export type SqsSender = Pick<SQSClient, 'send'>;

export interface SqsJobQueuePublisherOptions {
  readonly allowInsecureLocalhost?: boolean;
}

export class SqsJobQueuePublisher implements JobQueuePublisher {
  constructor(
    private readonly client: SqsSender,
    private readonly queueUrl: string,
    options: SqsJobQueuePublisherOptions = {},
  ) {
    const url = new URL(queueUrl);
    const insecureLoopback =
      options.allowInsecureLocalhost === true &&
      url.protocol === 'http:' &&
      ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
    if (url.protocol !== 'https:' && !insecureLoopback) {
      throw new TypeError('SQS queue URL must use HTTPS');
    }
  }

  async publish(event: OutboxEvent): Promise<void> {
    await this.client.send(
      new SendMessageCommand({
        QueueUrl: this.queueUrl,
        MessageBody: JSON.stringify({
          id: event.id,
          type: event.kind,
          jobId: event.jobId,
          payload: event.payload,
        }),
        MessageAttributes: {
          eventType: { DataType: 'String', StringValue: event.kind },
        },
      }),
    );
  }
}
