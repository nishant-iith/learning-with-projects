import { describe, it, expect } from 'vitest';
import { TaskMinHeap, TaskScheduler, Task } from './index.js';

describe('Task Scheduler Lab 08: Priority Queues & Workers', () => {

  describe('Task Min-Heap', () => {
    it('should sort and extract tasks based on lowest runAt timestamp', () => {
      const heap = new TaskMinHeap();

      const task1 = { id: '1', name: 't1', runAt: 300, action: async () => {}, retryCount: 0, maxRetries: 0 };
      const task2 = { id: '2', name: 't2', runAt: 100, action: async () => {}, retryCount: 0, maxRetries: 0 };
      const task3 = { id: '3', name: 't3', runAt: 200, action: async () => {}, retryCount: 0, maxRetries: 0 };

      heap.insert(task1);
      heap.insert(task2);
      heap.insert(task3);

      expect(heap.size()).toBe(3);
      expect(heap.peekMin()?.id).toBe('2');
      expect(heap.extractMin()?.id).toBe('2');
      expect(heap.extractMin()?.id).toBe('3');
      expect(heap.extractMin()?.id).toBe('1');
      expect(heap.extractMin()).toBeNull();
      expect(heap.size()).toBe(0);
    });

    it('should correctly maintain binary heap invariants with a larger set of tasks', () => {
      const heap = new TaskMinHeap();
      const runAtList = [500, 200, 700, 100, 300, 600, 400];
      
      runAtList.forEach((runAt, index) => {
        heap.insert({
          id: String(index),
          name: `task_${index}`,
          runAt,
          action: async () => {},
          retryCount: 0,
          maxRetries: 0
        });
      });

      const extracted: number[] = [];
      while (heap.size() > 0) {
        const task = heap.extractMin();
        if (task) extracted.push(task.runAt);
      }

      expect(extracted).toEqual([100, 200, 300, 400, 500, 600, 700]);
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
        await new Promise((resolve) => setTimeout(resolve, 30));
        running--;
      };

      const now = Date.now();
      const t1 = { id: '1', name: 't1', runAt: now, action, retryCount: 0, maxRetries: 0 };
      const t2 = { id: '2', name: 't2', runAt: now, action, retryCount: 0, maxRetries: 0 };
      const t3 = { id: '3', name: 't3', runAt: now, action, retryCount: 0, maxRetries: 0 };

      scheduler.schedule(t1);
      scheduler.schedule(t2);
      scheduler.schedule(t3);

      scheduler.start();
      
      // Let them start executing. With limit 2, task 1 & 2 should run, task 3 is queued.
      await new Promise((resolve) => setTimeout(resolve, 15));
      expect(scheduler.getActiveWorkersCount()).toBe(2);

      // Wait for task 1 & 2 to finish, and task 3 to start/finish
      await new Promise((resolve) => setTimeout(resolve, 80));
      scheduler.stop();

      expect(maxSeen).toBe(2); // Throttled successfully!
    });

    it('should run tasks in chronological priority order', async () => {
      const scheduler = new TaskScheduler(1); // 1 worker to strictly serialize
      const executedOrder: string[] = [];

      const action = (name: string) => async () => {
        executedOrder.push(name);
      };

      const now = Date.now();
      // Schedule out of chronological order, expect them to run in chronological order
      scheduler.schedule({ id: '3', name: 't3', runAt: now + 60, action: action('t3'), retryCount: 0, maxRetries: 0 });
      scheduler.schedule({ id: '1', name: 't1', runAt: now + 10, action: action('t1'), retryCount: 0, maxRetries: 0 });
      scheduler.schedule({ id: '2', name: 't2', runAt: now + 30, action: action('t2'), retryCount: 0, maxRetries: 0 });

      scheduler.start();

      await new Promise((resolve) => setTimeout(resolve, 120));
      scheduler.stop();

      expect(executedOrder).toEqual(['t1', 't2', 't3']);
    });

    it('should reschedule periodic tasks on successful execution', async () => {
      const scheduler = new TaskScheduler(2);
      let runCount = 0;

      const action = async () => {
        runCount++;
      };

      const now = Date.now();
      // A periodic task with a 30ms interval
      const periodicTask: Task = {
        id: 'periodic',
        name: 'periodic_task',
        runAt: now,
        action,
        retryCount: 0,
        maxRetries: 0,
        interval: 30
      };

      scheduler.schedule(periodicTask);
      scheduler.start();

      // Over 80ms, it should execute at now, now+30ms, now+60ms (~3-4 times depending on scheduling delays)
      await new Promise((resolve) => setTimeout(resolve, 80));
      scheduler.stop();

      expect(runCount).toBeGreaterThanOrEqual(2);
    });

    it('should handle failures with exponential backoff retries', async () => {
      const scheduler = new TaskScheduler(1);
      let failures = 0;
      let successes = 0;
      
      const action = async () => {
        if (failures < 2) {
          failures++;
          throw new Error('Failing');
        }
        successes++;
      };

      const now = Date.now();
      const failingTask: Task = {
        id: 'failing',
        name: 'failing_task',
        runAt: now,
        action,
        retryCount: 0,
        maxRetries: 3
      };

      scheduler.schedule(failingTask);
      scheduler.start();

      // Fail 1: at now. Backoff = 2^1 * 100ms = 200ms. Next run at now + 200ms.
      // Fail 2: at now + 200ms. Backoff = 2^2 * 100ms = 400ms. Next run at now + 600ms.
      // Success: at now + 600ms.
      
      // Let's wait 100ms: Fail 1 happens, rescheduled
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(failures).toBe(1);

      // Let's wait another 250ms (total 350ms): Fail 2 happens, rescheduled
      await new Promise((resolve) => setTimeout(resolve, 250));
      expect(failures).toBe(2);
      expect(successes).toBe(0);

      // Let's wait another 350ms (total 700ms): Success happens
      await new Promise((resolve) => setTimeout(resolve, 350));
      scheduler.stop();

      expect(failures).toBe(2);
      expect(successes).toBe(1);
    });
  });
});
