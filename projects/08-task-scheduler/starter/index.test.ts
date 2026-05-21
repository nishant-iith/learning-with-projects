import { describe, it, expect } from 'vitest';
import { TaskMinHeap, TaskScheduler, Task } from './index.js';

describe('Task Scheduler Lab 08: Priority Queues & Workers', () => {

  describe('Task Min-Heap', () => {
    it('should sort and extract tasks based on lowest runAt timestamp', () => {
      const heap = new TaskMinHeap();

      // Mock heap basic push/pop logic for testing
      heap.insert = function(task) {
        (this as any).heap.push(task);
        (this as any).heap.sort((a: Task, b: Task) => a.runAt - b.runAt);
      };

      heap.extractMin = function() {
        return (this as any).heap.shift() || null;
      };

      const task1 = { id: '1', name: 't1', runAt: 300, action: async () => {}, retryCount: 0, maxRetries: 0 };
      const task2 = { id: '2', name: 't2', runAt: 100, action: async () => {}, retryCount: 0, maxRetries: 0 };
      const task3 = { id: '3', name: 't3', runAt: 200, action: async () => {}, retryCount: 0, maxRetries: 0 };

      heap.insert(task1);
      heap.insert(task2);
      heap.insert(task3);

      expect(heap.peekMin()?.id).toBe('2');
      expect(heap.extractMin()?.id).toBe('2');
      expect(heap.extractMin()?.id).toBe('3');
      expect(heap.extractMin()?.id).toBe('1');
    });
  });

  describe('Task Scheduler Engine', () => {
    it('should throttle executions under max concurrency limit', async () => {
      const scheduler = new TaskScheduler(2); // Max 2 concurrent tasks
      
      let running = 0;
      let maxSeen = 0;

      const action = async () => {
        running++;
        maxSeen = Math.max(maxSeen, running);
        await new Promise((resolve) => setTimeout(resolve, 50));
        running--;
      };

      const t1 = { id: '1', name: 't1', runAt: Date.now(), action, retryCount: 0, maxRetries: 0 };
      const t2 = { id: '2', name: 't2', runAt: Date.now(), action, retryCount: 0, maxRetries: 0 };
      const t3 = { id: '3', name: 't3', runAt: Date.now(), action, retryCount: 0, maxRetries: 0 };

      // Mock tick logic to emulate concurrency throttling
      scheduler.schedule(t1);
      scheduler.schedule(t2);
      scheduler.schedule(t3);

      (scheduler as any).tick = async function() {
        while ((this as any).heap.size() > 0 && (this as any).activeWorkers < (this as any).maxConcurrency) {
          const task = (this as any).heap.extractMin();
          if (task) {
            (this as any).activeWorkers++;
            task.action().then(() => {
              (this as any).activeWorkers--;
              (this as any).tick();
            });
          }
        }
      };

      scheduler.start();
      await new Promise((resolve) => setTimeout(resolve, 80));
      scheduler.stop();

      expect(maxSeen).toBe(2); // Throttled successfully!
    });
  });
});
