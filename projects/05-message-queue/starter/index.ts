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
  private topicSequence: Map<string, number> = new Map();

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
    this.registerTopic(topic);
    const msgs = this.getTopicMessages(topic);
    
    const nextOffset = this.topicSequence.get(topic) || 0;
    this.topicSequence.set(topic, nextOffset + 1);

    const msg: Message = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      offset: nextOffset,
      payload,
      retryCount: 0,
      visibleAfter: 0
    };

    msgs.push(msg);
    return msg;
  }

  public consume(topic: string, consumerId: string): Message | null {
    const msgs = this.getTopicMessages(topic);
    const key = `${topic}:${consumerId}`;
    const currentOffset = this.consumerOffsets.get(key) || 0;
    const now = Date.now();

    // Find the first message whose offset is >= consumer's current offset and is visible
    const msg = msgs.find(m => m.offset >= currentOffset && m.visibleAfter <= now);
    if (msg) {
      msg.visibleAfter = now + this.visibilityTimeout;
      return msg;
    }
    return null;
  }

  public ack(topic: string, consumerId: string, messageId: string) {
    const key = `${topic}:${consumerId}`;
    const currentOffset = this.consumerOffsets.get(key) || 0;
    const msgs = this.getTopicMessages(topic);
    const msg = msgs.find(m => m.id === messageId);
    if (msg) {
      this.consumerOffsets.set(key, Math.max(currentOffset, msg.offset + 1));
    }
  }

  public nack(topic: string, consumerId: string, messageId: string) {
    const msgs = this.getTopicMessages(topic);
    const msg = msgs.find(m => m.id === messageId);
    if (msg) {
      msg.visibleAfter = 0; // Release immediately
      msg.retryCount += 1;
      if (msg.retryCount >= this.maxRetries) {
        this.dlq.push(msg);
        const idx = msgs.indexOf(msg);
        if (idx > -1) {
          msgs.splice(idx, 1);
        }
      }
    }
  }

  public getDLQ(): Message[] {
    return this.dlq;
  }

  public getTopicMessages(topic: string): Message[] {
    return this.topics.get(topic) || [];
  }
}

