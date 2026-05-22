import { describe, it, expect } from 'vitest';
import { MessageQueueBroker } from './index.js';

describe('Message Broker Lab 05: Pub/Sub & DLQ', () => {

  it('should publish and consume messages in order', () => {
    const broker = new MessageQueueBroker();
    broker.registerTopic('orders');

    broker.publish('orders', 'Order 1');
    broker.publish('orders', 'Order 2');

    const msg1 = broker.consume('orders', 'worker-1');
    expect(msg1?.payload).toBe('Order 1');
    expect(msg1?.offset).toBe(0);

    // Commit worker-1 offset for msg1
    broker.ack('orders', 'worker-1', msg1!.id);

    const msg2 = broker.consume('orders', 'worker-1');
    expect(msg2?.payload).toBe('Order 2');
    expect(msg2?.offset).toBe(1);
  });

  it('should support visibility timeout locking', async () => {
    const broker = new MessageQueueBroker(100); // 100ms visibility timeout
    broker.registerTopic('notifications');

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

  it('should release message immediately on nack and support DLQ promotion', () => {
    const broker = new MessageQueueBroker(1000, 2); // 2 max retries
    broker.registerTopic('jobs');

    const msg = broker.publish('jobs', 'Process Heavy Task');

    // First attempt
    const firstFetch = broker.consume('jobs', 'worker-3');
    expect(firstFetch?.id).toBe(msg.id);
    expect(firstFetch?.retryCount).toBe(0);

    // Nack releases the lock and increments retry count
    broker.nack('jobs', 'worker-3', msg.id);
    expect(msg.retryCount).toBe(1);
    expect(msg.visibleAfter).toBe(0); // Instantly visible

    // Second attempt
    const secondFetch = broker.consume('jobs', 'worker-3');
    expect(secondFetch?.id).toBe(msg.id);
    expect(secondFetch?.retryCount).toBe(1);

    // Second nack hits maxRetries (2) -> Promotes message to DLQ and splices it out of main queue
    broker.nack('jobs', 'worker-3', msg.id);

    const dlq = broker.getDLQ();
    expect(dlq.length).toBe(1);
    expect(dlq[0].payload).toBe('Process Heavy Task');

    const remaining = broker.getTopicMessages('jobs');
    expect(remaining.length).toBe(0); // Ejected from main queue
  });
});

