import { describe, it, expect } from 'vitest';
import * as dgram from 'dgram';
import { LogRingBuffer, LogAggregatorServer } from './index.js';

describe('Log Aggregator Lab 07: UDP & Ring Buffers', () => {

  describe('Log Ring Buffer', () => {
    it('should overwrite oldest items when capacity is exceeded', () => {
      const buffer = new LogRingBuffer(3);

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

  describe('Log Parsing & Querying', () => {
    it('should parse compliant log lines', () => {
      const parsed = LogAggregatorServer.parseLogLine("1716300000000 [INFO] User logged in");
      expect(parsed).not.toBeNull();
      expect(parsed?.timestamp).toBe(1716300000000);
      expect(parsed?.severity).toBe('INFO');
      expect(parsed?.message).toBe('User logged in');
    });

    it('should filter logs by severity and time range', () => {
      const server = new LogAggregatorServer(10);
      server.ingestLogString("1716300000000 [INFO] Task start");
      server.ingestLogString("1716310000000 [WARN] Slow response");
      server.ingestLogString("1716320000000 [ERROR] Out of memory");

      const errorLogs = server.queryLogs({ severity: 'ERROR' });
      expect(errorLogs.length).toBe(1);
      expect(errorLogs[0].message).toBe("Out of memory");

      const timeRangeLogs = server.queryLogs({ startTime: 1716305000000, endTime: 1716315000000 });
      expect(timeRangeLogs.length).toBe(1);
      expect(timeRangeLogs[0].message).toBe("Slow response");
    });
  });

  describe('UDP Server Integration', () => {
    it('should start UDP server, receive logs over UDP socket, and stop safely', async () => {
      const server = new LogAggregatorServer(5);
      const port = 9876;
      await server.start(port);

      const client = dgram.createSocket('udp4');
      const message = Buffer.from("1716300000000 [WARN] Out of memory threat detected");

      await new Promise<void>((resolve, reject) => {
        client.send(message, 0, message.length, port, '127.0.0.1', (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      // Wait a short time for UDP packet delivery
      await new Promise((resolve) => setTimeout(resolve, 150));

      const logs = server.queryLogs({ severity: 'WARN' });
      expect(logs.length).toBe(1);
      expect(logs[0].message).toBe("Out of memory threat detected");

      client.close();
      await server.stop();
    });
  });
});

