import * as dgram from 'dgram';

export interface LogEntry {
  timestamp: number; // epoch millisecond
  severity: 'INFO' | 'WARN' | 'ERROR';
  message: string;
}

export class LogRingBuffer {
  protected buffer: LogEntry[];
  protected capacity: number;
  protected writePointer: number = 0;
  protected count: number = 0;

  constructor(capacity: number) {
    this.capacity = capacity;
    this.buffer = new Array(capacity);
  }

  public push(entry: LogEntry) {
    this.buffer[this.writePointer] = entry;
    this.writePointer = (this.writePointer + 1) % this.capacity;
    if (this.count < this.capacity) {
      this.count++;
    }
  }

  public getAll(): LogEntry[] {
    const result: LogEntry[] = [];
    const start = this.count === this.capacity ? this.writePointer : 0;
    for (let i = 0; i < this.count; i++) {
      result.push(this.buffer[(start + i) % this.capacity]);
    }
    return result;
  }

  public getCount(): number {
    return this.count;
  }
}

export class LogAggregatorServer {
  private udpSocket: dgram.Socket | null = null;
  private ringBuffer: LogRingBuffer;

  constructor(capacity: number = 1000) {
    this.ringBuffer = new LogRingBuffer(capacity);
  }

  public start(port: number, host: string = '127.0.0.1'): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.udpSocket = dgram.createSocket('udp4');
        
        this.udpSocket.on('message', (msg) => {
          const logStr = msg.toString('utf8');
          this.ingestLogString(logStr);
        });

        this.udpSocket.on('error', (err) => {
          // Handle socket errors gracefully
        });

        this.udpSocket.bind(port, host, () => {
          resolve();
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  public stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.udpSocket) {
        try {
          this.udpSocket.close();
        } catch {
          // Ignore close errors
        }
        this.udpSocket = null;
      }
      resolve();
    });
  }

  public ingestLogString(logStr: string) {
    const parsed = LogAggregatorServer.parseLogLine(logStr);
    if (parsed) {
      this.ringBuffer.push(parsed);
    }
  }

  public queryLogs(filters: {
    severity?: 'INFO' | 'WARN' | 'ERROR';
    startTime?: number;
    endTime?: number;
  }): LogEntry[] {
    let logs = this.ringBuffer.getAll();

    if (filters.severity) {
      logs = logs.filter(l => l.severity === filters.severity);
    }
    if (filters.startTime !== undefined) {
      logs = logs.filter(l => l.timestamp >= filters.startTime!);
    }
    if (filters.endTime !== undefined) {
      logs = logs.filter(l => l.timestamp <= filters.endTime!);
    }

    return logs;
  }

  public static parseLogLine(line: string): LogEntry | null {
    const regex = /^(\d+)\s+\[(INFO|WARN|ERROR)\]\s+(.+)$/;
    const match = line.match(regex);
    if (!match) return null;
    return {
      timestamp: parseInt(match[1], 10),
      severity: match[2] as 'INFO' | 'WARN' | 'ERROR',
      message: match[3]
    };
  }
}

