export interface Message {
  id: string;
  offset: number;
  payload: string;
  retryCount: number;
  visibleAfter: number; // Timestamp when message becomes visible again
}

export class MessageQueueBroker {
  protected topics: Map<string, Message[]> = new Map();
  protected dlq: Message[] = [];
  protected consumerOffsets: Map<string, number> = new Map(); // Key: 'topic:consumerId', Value: offset
  protected visibilityTimeout: number; // In milliseconds
  protected maxRetries: number;

  constructor(visibilityTimeout: number = 2000, maxRetries: number = 3) {
    this.visibilityTimeout = visibilityTimeout;
    this.maxRetries = maxRetries;
  }

  public registerTopic(topic: string) {
    if (!this.topics.has(topic)) {
      this.topics.set(topic, []);
    }
  }

  public publish(topic: string, payload: string): Message {
    // TODO: Register topic if not exists
    // TODO: Construct new Message with unique ID, auto-incrementing offset, retryCount: 0, visibleAfter: 0
    // TODO: Append to the topic's message array and return the message
    throw new Error('publish is not implemented');
  }

  public consume(topic: string, consumerId: string): Message | null {
    // TODO: Fetch next visible message for the consumer based on offset
    // TODO: Verify if the message's visibleAfter timestamp has passed
    // TODO: If found, update its visibleAfter timestamp (now + visibilityTimeout) to lock it, and return it
    // TODO: If no visible message, return null
    throw new Error('consume is not implemented');
  }

  public ack(topic: string, consumerId: string, messageId: string) {
    // TODO: Confirm processing of message
    // TODO: Commit consumer offset: increment consumer's offset key in consumerOffsets
  }

  public nack(topic: string, consumerId: string, messageId: string) {
    // TODO: Release message immediately (set visibleAfter = 0) so other workers can process it
    // TODO: Increment retryCount. If retryCount >= maxRetries, move message to DLQ (remove from main topic array)
  }

  public getDLQ(): Message[] {
    return this.dlq;
  }

  public getTopicMessages(topic: string): Message[] {
    return this.topics.get(topic) || [];
  }
}
