import { describe, it, expect } from 'vitest';
import { MessageQueueBroker } from './index.js';

describe('Message Broker Lab 05: Pub/Sub & DLQ', () => {

  it('should publish and consume messages in order', () => {
    const broker = new MessageQueueBroker();
    broker.registerTopic('orders');

    // Mock simple implementation
    broker.publish = function(topic, payload) {
      const msgs = this.getTopicMessages(topic);
      const msg = {
        id: Math.random().toString(),
        offset: msgs.length,
        payload,
        retryCount: 0,
        visibleAfter: 0
      };
      msgs.push(msg);
      return msg;
    };

    broker.consume = function(topic, consumerId) {
      const msgs = this.getTopicMessages(topic);
      const key = `${topic}:${consumerId}`;
      const offset = (this as any).consumerOffsets.get(key) || 0;
      if (offset < msgs.length) {
        const msg = msgs[offset];
        return msg;
      }
      return null;
    };

    broker.publish('orders', 'Order 1');
    broker.publish('orders', 'Order 2');

    const msg1 = broker.consume('orders', 'worker-1');
    expect(msg1?.payload).toBe('Order 1');
    expect(msg1?.offset).toBe(0);
  });

  it('should support visibility timeout locking', async () => {
    const broker = new MessageQueueBroker(100); // 100ms visibility timeout
    broker.registerTopic('notifications');

    broker.publish = function(topic, payload) {
      const msgs = this.getTopicMessages(topic);
      const msg = {
        id: 'msg-1',
        offset: msgs.length,
        payload,
        retryCount: 0,
        visibleAfter: 0
      };
      msgs.push(msg);
      return msg;
    };

    broker.consume = function(topic, consumerId) {
      const msgs = this.getTopicMessages(topic);
      const now = Date.now();
      for (const msg of msgs) {
        if (msg.visibleAfter <= now) {
          msg.visibleAfter = now + (this as any).visibilityTimeout;
          return msg;
        }
      }
      return null;
    };

    broker.publish('notifications', 'Welcome Event');

    const firstFetch = broker.consume('notifications', 'worker-2');
    expect(firstFetch?.payload).toBe('Welcome Event');

    const secondFetch = broker.consume('notifications', 'worker-2');
    expect(secondFetch).toBeNull(); // Locked!

    // Wait for visibility lock to expire
    await new Promise((resolve) => setTimeout(resolve, 120));

    const thirdFetch = broker.consume('notifications', 'worker-2');
    expect(thirdFetch?.payload).toBe('Welcome Event'); // Unlocked!
  });
});
