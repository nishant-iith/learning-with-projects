export interface Task {
  id: string;
  name: string;
  runAt: number; // Timestamp in milliseconds (lower runAt has higher priority)
  action: () => Promise<void>;
  retryCount: number;
  maxRetries: number;
  interval?: number; // In milliseconds for cron/periodic tasks
}

export class TaskMinHeap {
  protected heap: Task[] = [];

  public insert(task: Task) {
    this.heap.push(task);
    this.bubbleUp(this.heap.length - 1);
  }

  public extractMin(): Task | null {
    if (this.heap.length === 0) return null;
    const min = this.heap[0];
    const last = this.heap.pop()!;
    if (this.heap.length > 0) {
      this.heap[0] = last;
      this.bubbleDown(0);
    }
    return min;
  }

  public peekMin(): Task | null {
    return this.heap.length > 0 ? this.heap[0] : null;
  }

  public size(): number {
    return this.heap.length;
  }

  private bubbleUp(index: number) {
    while (index > 0) {
      const parentIndex = Math.floor((index - 1) / 2);
      if (this.heap[index].runAt >= this.heap[parentIndex].runAt) {
        break;
      }
      this.swap(index, parentIndex);
      index = parentIndex;
    }
  }

  private bubbleDown(index: number) {
    const length = this.heap.length;
    while (true) {
      let smallest = index;
      const left = 2 * index + 1;
      const right = 2 * index + 2;

      if (left < length && this.heap[left].runAt < this.heap[smallest].runAt) {
        smallest = left;
      }
      if (right < length && this.heap[right].runAt < this.heap[smallest].runAt) {
        smallest = right;
      }
      if (smallest === index) {
        break;
      }
      this.swap(index, smallest);
      index = smallest;
    }
  }

  private swap(i: number, j: number) {
    const temp = this.heap[i];
    this.heap[i] = this.heap[j];
    this.heap[j] = temp;
  }
}

export class TaskScheduler {
  protected heap: TaskMinHeap = new TaskMinHeap();
  protected maxConcurrency: number;
  protected activeWorkers: number = 0;
  protected running: boolean = false;
  protected tickTimeout: any = null;

  constructor(maxConcurrency: number = 2) {
    this.maxConcurrency = maxConcurrency;
  }

  public schedule(task: Task) {
    this.heap.insert(task);
    if (this.running) {
      if (this.tickTimeout) {
        clearTimeout(this.tickTimeout);
        this.tickTimeout = null;
      }
      this.tick();
    }
  }

  public start() {
    this.running = true;
    this.tick();
  }

  public stop() {
    this.running = false;
    if (this.tickTimeout) {
      clearTimeout(this.tickTimeout);
      this.tickTimeout = null;
    }
  }

  protected async tick() {
    if (!this.running) return;

    const now = Date.now();

    while (this.running && this.activeWorkers < this.maxConcurrency) {
      const minTask = this.heap.peekMin();
      if (!minTask) {
        break;
      }

      if (minTask.runAt > now) {
        const delay = minTask.runAt - now;
        if (!this.tickTimeout) {
          this.tickTimeout = setTimeout(() => {
            this.tickTimeout = null;
            this.tick();
          }, delay);
        }
        break;
      }

      const task = this.heap.extractMin();
      if (!task) break;

      this.activeWorkers++;

      task.action()
        .then(() => {
          this.activeWorkers--;
          if (task.interval !== undefined) {
            const rescheduledTask: Task = {
              ...task,
              runAt: Date.now() + task.interval,
              retryCount: 0
            };
            this.schedule(rescheduledTask);
          }
          this.tick();
        })
        .catch(() => {
          this.activeWorkers--;
          if (task.retryCount < task.maxRetries) {
            const nextRetryCount = task.retryCount + 1;
            const backoff = Math.pow(2, nextRetryCount) * 100;
            const rescheduledTask: Task = {
              ...task,
              retryCount: nextRetryCount,
              runAt: Date.now() + backoff
            };
            this.schedule(rescheduledTask);
          }
          this.tick();
        });
    }
  }

  public getActiveWorkersCount(): number {
    return this.activeWorkers;
  }
}
