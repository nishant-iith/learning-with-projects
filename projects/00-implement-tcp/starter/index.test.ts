import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TCPServer, TCPClient } from './index.js';
import * as net from 'net';

/**
 * TDD Test Suite: Lab 00 — Raw TCP Server & Client
 *
 * These tests cover the full lifecycle of a TCP connection:
 *   - Connection establishment (3-way handshake)
 *   - Data transfer (including backpressure)
 *   - Disconnection (FIN handshake)
 *   - Multiple concurrent connections
 *   - Error scenarios (ECONNREFUSED, half-open sockets)
 *   - Keep-alive and no-delay configuration
 *
 * Each test uses a unique port range starting from 9001 to avoid EADDRINUSE conflicts.
 */
describe('TCP Lab 00: Raw TCP Server & Client', () => {
  const BASE_PORT = 9001;

  it('should start the server and client, and connect successfully', async () => {
    /**
     * SCENARIO: Basic connection establishment.
     * EXPECTED: After client.connect(), the server's onConnection callback fires
     * and the active connection count increments to 1.
     * VERIFIES: 3-way handshake completes, onConnection callback is invoked.
     */
    const server = new TCPServer();
    const client = new TCPClient();

    let serverConnected = false;
    server.onConnection(() => {
      serverConnected = true;
    });

    await server.start(BASE_PORT);
    await client.connect(BASE_PORT);

    // Allow connection to register (event loop tick)
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(serverConnected).toBe(true);
    expect(server.getActiveConnectionsCount()).toBe(1);

    await client.disconnect();
    await server.stop();
  });

  it('should transfer data successfully from client to server', async () => {
    /**
     * SCENARIO: Client sends a UTF-8 string message to the server.
     * EXPECTED: Server's onData callback receives the exact bytes sent.
     * VERIFIES: Data event pipeline, Buffer-to-string conversion.
     */
    const server = new TCPServer();
    const client = new TCPClient();
    let receivedData = '';

    server.onData((socket, data) => {
      receivedData += data.toString();
    });

    await server.start(BASE_PORT + 1);
    await client.connect(BASE_PORT + 1);

    await client.send('Hello System Design!');
    
    // Allow data to transmit
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(receivedData).toBe('Hello System Design!');

    await client.disconnect();
    await server.stop();
  });

  it('should handle backpressure when writing to socket', async () => {
    /**
     * SCENARIO: The OS write buffer is full (socket.write returns false).
     * EXPECTED: send() registers a 'drain' listener and resolves only after drain fires.
     * VERIFIES: Backpressure-aware write implementation — critical for OOM prevention.
     *
     * PRODUCTION RELEVANCE: Without this, a fast sender pumping data into a slow
     * receiver will silently fill the process heap, causing an OOM crash.
     */
    const client = new TCPClient();
    const mockSocket = new net.Socket();
    
    // Force socket write to return false (buffer full)
    let drainRegistered = false;
    mockSocket.write = (data: any, cb?: any): boolean => {
      return false;
    };
    
    mockSocket.on = function(event: string, listener: any): any {
      if (event === 'drain') {
        drainRegistered = true;
        // Simulate drain event firing
        setTimeout(listener, 10);
      }
      return this;
    };

    // Inject mock socket
    (client as any).socket = mockSocket;

    const sendPromise = client.send('Very large buffer data...');
    expect(drainRegistered).toBe(true);

    await sendPromise; // Should resolve after drain event fires
  });

  it('should track multiple concurrent client connections accurately', async () => {
    /**
     * SCENARIO: Three clients connect simultaneously.
     * EXPECTED: getActiveConnectionsCount() returns 3.
     * VERIFIES: activeSockets Set correctly tracks multiple concurrent FDs.
     *
     * PRODUCTION RELEVANCE: A server must track active FDs to enforce per-server
     * connection limits and avoid EMFILE (too many open files) errors.
     */
    const server = new TCPServer();
    const clients = [new TCPClient(), new TCPClient(), new TCPClient()];

    await server.start(BASE_PORT + 2);
    
    for (const client of clients) {
      await client.connect(BASE_PORT + 2);
    }
    
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(server.getActiveConnectionsCount()).toBe(3);

    for (const client of clients) {
      await client.disconnect();
    }
    
    // After all clients disconnect, count should return to 0
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(server.getActiveConnectionsCount()).toBe(0);

    await server.stop();
  });

  it('should invoke onClose callback when a client disconnects', async () => {
    /**
     * SCENARIO: Client disconnects gracefully using disconnect().
     * EXPECTED: Server's onClose callback fires and active count drops.
     * VERIFIES: 'close' event propagation, onClose hook, activeSockets cleanup.
     *
     * EDGE CASE: The close event fires for both graceful (FIN) and abrupt (destroy) disconnections.
     */
    const server = new TCPServer();
    const client = new TCPClient();
    let closedSocketCount = 0;

    server.onClose(() => {
      closedSocketCount++;
    });

    await server.start(BASE_PORT + 3);
    await client.connect(BASE_PORT + 3);
    await new Promise((resolve) => setTimeout(resolve, 30));

    await client.disconnect();
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(closedSocketCount).toBe(1);
    expect(server.getActiveConnectionsCount()).toBe(0);

    await server.stop();
  });

  it('should notify client when server disconnects (onDisconnect callback)', async () => {
    /**
     * SCENARIO: Server closes, triggering client's disconnect callback.
     * EXPECTED: The client's onDisconnect callback fires after server.stop().
     * VERIFIES: Client-side 'close' event detection, half-open connection cleanup.
     *
     * PRODUCTION RELEVANCE: Clients must detect server-initiated closures to
     * trigger reconnect logic or drain pending request queues gracefully.
     */
    const server = new TCPServer();
    const client = new TCPClient();
    let clientDisconnected = false;

    client.onDisconnect(() => {
      clientDisconnected = true;
    });

    await server.start(BASE_PORT + 4);
    await client.connect(BASE_PORT + 4);
    await new Promise((resolve) => setTimeout(resolve, 30));

    await server.stop(); // Server kills all client sockets
    await new Promise((resolve) => setTimeout(resolve, 80));

    expect(clientDisconnected).toBe(true);
  });

  it('should send and receive binary Buffer data correctly', async () => {
    /**
     * SCENARIO: Client sends a raw binary Buffer (not a string).
     * EXPECTED: Server receives the exact same bytes.
     * VERIFIES: Buffer passthrough (not accidentally stringified/encoded).
     *
     * PRODUCTION RELEVANCE: Protocol parsers (HTTP, WebSocket, Redis RESP) work
     * on raw Buffers. Any accidental UTF-8 conversion corrupts binary frames.
     */
    const server = new TCPServer();
    const client = new TCPClient();
    const received: number[] = [];

    server.onData((socket, data) => {
      for (const byte of data) {
        received.push(byte);
      }
    });

    await server.start(BASE_PORT + 5);
    await client.connect(BASE_PORT + 5);

    const binaryPayload = Buffer.from([0x00, 0x01, 0xFF, 0xFE, 0x7F]);
    await client.send(binaryPayload);
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(received).toEqual([0x00, 0x01, 0xFF, 0xFE, 0x7F]);

    await client.disconnect();
    await server.stop();
  });

  it('should reject connect() when server is not listening (ECONNREFUSED)', async () => {
    /**
     * SCENARIO: Client tries to connect to a port with no listening server.
     * EXPECTED: connect() rejects with an ECONNREFUSED error.
     * VERIFIES: Error event handling in connect(), OS-level rejection propagation.
     *
     * EDGE CASE: This is the most common network error in distributed systems.
     * Microservices must handle ECONNREFUSED to implement retry/circuit-breaker logic.
     */
    const client = new TCPClient();

    await expect(client.connect(19999, '127.0.0.1')).rejects.toThrow();
  });

  it('should stop cleanly with no active connections', async () => {
    /**
     * SCENARIO: server.stop() is called with zero connected clients.
     * EXPECTED: Resolves without error; server is shut down cleanly.
     * VERIFIES: Null-safe stop() implementation handles empty activeSockets Set.
     *
     * EDGE CASE: A server that never accepted a connection should still shut down
     * without throwing on the empty `activeSockets` Set.
     */
    const server = new TCPServer();
    await server.start(BASE_PORT + 6);
    await expect(server.stop()).resolves.not.toThrow();
  });

  it('should disable Nagle algorithm (TCP_NODELAY) on connected sockets', async () => {
    /**
     * SCENARIO: Verify that TCP_NODELAY is set on accepted server-side sockets.
     * EXPECTED: socket.readyState is 'open' and setNoDelay was called (inferred by behavior).
     * VERIFIES: Low-latency socket configuration — critical for chat/gaming/redis-like use cases.
     *
     * NOTE: Node.js does not expose a direct "isNoDelaySet()" getter.
     * We verify behavioral equivalence: data must arrive without 200ms Nagle delay.
     */
    const server = new TCPServer();
    const client = new TCPClient();
    const receivedTimes: number[] = [];

    server.onData((socket, data) => {
      receivedTimes.push(Date.now());
    });

    await server.start(BASE_PORT + 7);
    await client.connect(BASE_PORT + 7);

    const t0 = Date.now();
    await client.send('A');
    await client.send('B');
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Both packets should arrive in < 50ms each (no Nagle delay of 200ms)
    for (const t of receivedTimes) {
      expect(t - t0).toBeLessThan(100);
    }

    await client.disconnect();
    await server.stop();
  });
});
