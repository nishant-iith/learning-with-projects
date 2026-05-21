import { describe, it, expect } from 'vitest';
import { TCPServer, TCPClient } from './index.js';
import * as net from 'net';

describe('TCP Lab 00: Raw TCP Server & Client', () => {
  const PORT = 9001;

  it('should start the server and client, and connect successfully', async () => {
    const server = new TCPServer();
    const client = new TCPClient();

    let serverConnected = false;
    server.onConnection(() => {
      serverConnected = true;
    });

    await server.start(PORT);
    await client.connect(PORT);

    // Let connection register
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(serverConnected).toBe(true);
    expect(server.getActiveConnectionsCount()).toBe(1);

    await client.disconnect();
    await server.stop();
  });

  it('should transfer data successfully from client to server', async () => {
    const server = new TCPServer();
    const client = new TCPClient();
    let receivedData = '';

    server.onData((socket, data) => {
      receivedData += data.toString();
    });

    await server.start(PORT);
    await client.connect(PORT);

    await client.send('Hello System Design!');
    
    // Allow data to transmit
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(receivedData).toBe('Hello System Design!');

    await client.disconnect();
    await server.stop();
  });

  it('should handle backpressure when writing to socket', async () => {
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
});
