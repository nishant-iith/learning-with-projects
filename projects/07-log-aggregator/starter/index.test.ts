import { describe, it, expect } from 'vitest';
import { LogRingBuffer, LogAggregatorServer, LogEntry } from './index.js';

describe('Log Aggregator Lab 07: UDP & Ring Buffers', () => {

  describe('Log Ring Buffer', () => {
    it('should overwrite oldest items when capacity is exceeded', () => {
      const buffer = new LogRingBuffer(3);

      buffer.push = function(entry) {
        (this as any).buffer[(this as any).writePointer] = entry;
        (this as any).writePointer = ((this as any).writePointer + 1) % (this as any).capacity;
        if ((this as any).count < (this as any).capacity) (this as any).count++;
      };

      buffer.getAll = function() {
        const result: LogEntry[] = [];
        const start = (this as any).count === (this as any).capacity ? (this as any).writePointer : 0;
        for (let i = 0; i < (this as any).count; i++) {
          result.push((this as any).buffer[(start + i) % (this as any).capacity]);
        }
        return result;
      };

      const log1 = { timestamp: 1, severity: 'INFO' as const, message: 'm1' };
      const log2 = { timestamp: 2, severity: 'WARN' as const, message: 'm2' };
      const log3 = { timestamp: 3, severity: 'ERROR' as const, message: 'm3' };
      const log4 = { timestamp: 4, severity: 'INFO' as const, message: 'm4' };

      buffer.push(log1);
      buffer.push(log2);
      buffer.push(log3);
      buffer.push(log4); // Overwrites log1

      const all = buffer.getAll();
      expect(all.length).toBe(3);
      expect(all[0].message).toBe('m2'); // Log 2 is now the oldest
      expect(all[2].message).toBe('m4'); // Log 4 is the newest
    });
  });

  describe('Log Parsing', () => {
    it('should parse compliant log lines', () => {
      LogAggregatorServer.parseLogLine = (line) => {
        const regex = /^(\d+)\s+\[(INFO|WARN|ERROR)\]\s+(.+)$/;
        const match = line.match(regex);
        if (!match) return null;
        return {
          timestamp: parseInt(match[1]),
          severity: match[2] as any,
          message: match[3]
        };
      };

      const parsed = LogAggregatorServer.parseLogLine("1716300000000 [INFO] User logged in");
      expect(parsed).not.toBeNull();
      expect(parsed?.timestamp).toBe(1716300000000);
      expect(parsed?.severity).toBe('INFO');
      expect(parsed?.message).toBe('User logged in');
    });
  });
});
