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
    // TODO: Insert task at the end of the array, bubble up to restore min-heap property based on runAt
    throw new Error('insert is not implemented');
  }

  public extractMin(): Task | null {
    // TODO: Extract task with lowest runAt (root of the heap)
    // TODO: Restore min-heap property by bubbling down the replacement root
    throw new Error('extractMin is not implemented');
  }

  public peekMin(): Task | null {
    return this.heap.length > 0 ? this.heap[0] : null;
  }

  public size(): number {
    return this.heap.length;
  }
}

export class TaskScheduler {
  protected heap: TaskMinHeap = new TaskMinHeap();
  protected maxConcurrency: number;
  protected activeWorkers: number = 0;
  protected running: boolean = false;

  constructor(maxConcurrency: number = 2) {
    this.maxConcurrency = maxConcurrency;
  }

  public schedule(task: Task) {
    this.heap.insert(task);
  }

  public start() {
    this.running = true;
    this.tick();
  }

  public stop() {
    this.running = false;
  }

  protected async tick() {
    // TODO: While running, activeWorkers < maxConcurrency, and lowest task runAt <= Date.now():
    //       - Extract task
    //       - Increment activeWorkers
    //       - Run task action in background
    //       - On success, if periodic (interval is present), reschedule task with runAt = now + interval
    //       - On failure, reschedule with exponential backoff: runAt = now + Math.pow(2, retryCount) * 100
    //       - Decrement activeWorkers and recursively call tick()
  }

  public getActiveWorkersCount(): number {
    return this.activeWorkers;
  }
}
