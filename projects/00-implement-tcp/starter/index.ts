import * as net from 'net';

/**
 * @class TCPServer
 * @description A low-level TCP server wrapper built on Node.js `net.Server`.
 *
 * WHY IT EXISTS:
 * Provides a clean, event-driven interface over raw OS socket file descriptors.
 * This server is the foundation on which higher-level protocols (HTTP, WebSocket,
 * Redis protocol) are built. It demonstrates:
 *   - Connection lifecycle management (accept, track, close)
 *   - Backpressure awareness (TCP_NODELAY)
 *   - Graceful shutdown (destroy all active sockets before closing)
 *
 * CONTRACT ENFORCED:
 * - Every accepted client socket MUST have TCP_NODELAY enabled to prevent
 *   Nagle's algorithm from batching small writes into delayed 200ms packets.
 * - Every active socket MUST be tracked in the `activeSockets` Set so that
 *   `stop()` can cleanly destroy them (preventing FD leaks on process exit).
 * - All socket 'error' events MUST be handled to prevent process crashes.
 */
export class TCPServer {
  private server: net.Server | null = null;
  private activeSockets: Set<net.Socket> = new Set();
  
  // Event listeners
  private onConnectionCallback: ((socket: net.Socket) => void) | null = null;
  private onDataCallback: ((socket: net.Socket, data: Buffer) => void) | null = null;
  private onCloseCallback: ((socket: net.Socket) => void) | null = null;

  constructor() {}

  /**
   * Starts the TCP server and begins accepting client connections.
   *
   * WHAT IT SHOULD DO:
   * 1. Create a `net.Server` via `net.createServer()`.
   * 2. For each incoming connection:
   *    a. Call `socket.setNoDelay(true)` — disables Nagle's algorithm (TCP_NODELAY).
   *    b. Add the socket to `activeSockets` for lifecycle tracking.
   *    c. Invoke `onConnectionCallback` if registered.
   *    d. Register a `'data'` listener to forward data to `onDataCallback`.
   *    e. Register a `'close'` listener to remove from `activeSockets` and invoke `onCloseCallback`.
   *    f. Register an `'error'` listener to call `socket.destroy()` — prevents uncaught exceptions.
   * 3. Bind the server to `port` and `host` using `server.listen()`.
   * 4. Register `server.on('error', reject)` to catch EADDRINUSE and other bind failures.
   *
   * @param port - The TCP port to bind to (1024–65535 for non-root processes).
   * @param host - The network interface to bind to. Defaults to loopback (`127.0.0.1`).
   * @returns A Promise that resolves when the server is bound and listening.
   *
   * EDGE CASES:
   * - If the port is already in use, the promise should reject with `EADDRINUSE`.
   * - If `host` is `0.0.0.0`, the server listens on all network interfaces.
   */
  public start(port: number, host: string = '127.0.0.1'): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = net.createServer((socket) => {
        socket.setNoDelay(true);
        this.activeSockets.add(socket);

        if (this.onConnectionCallback) {
          this.onConnectionCallback(socket);
        }

        socket.on('data', (data) => {
          if (this.onDataCallback) {
            this.onDataCallback(socket, data);
          }
        });

        socket.on('close', () => {
          this.activeSockets.delete(socket);
          if (this.onCloseCallback) {
            this.onCloseCallback(socket);
          }
        });

        socket.on('error', () => {
          socket.destroy();
        });
      });

      this.server.on('error', (err) => {
        reject(err);
      });

      this.server.listen(port, host, () => {
        resolve();
      });
    });
  }

  /**
   * Gracefully shuts down the TCP server.
   *
   * WHAT IT SHOULD DO:
   * 1. Stop accepting new connections (equivalent to OS `shutdown(SHUT_RDWR)`).
   * 2. Iterate through `activeSockets` and call `socket.destroy()` on each.
   *    - `socket.end()` is NOT sufficient here — it only closes the write-side.
   *    - `socket.destroy()` immediately kills the FD, releasing kernel resources.
   * 3. Call `server.close()` to release the listening socket FD.
   *
   * EDGE CASES:
   * - If `stop()` is called before `start()`, handle the `server === null` case gracefully.
   * - If a socket is already destroyed, `socket.destroy()` is a no-op and safe to call.
   */
  public stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.server === null) {
        resolve();
        return;
      }

      for (const socket of this.activeSockets) {
        socket.destroy();
      }
      this.activeSockets.clear();

      this.server.close((err) => {
        if (err) {
          reject(err);
        } else {
          this.server = null;
          resolve();
        }
      });
    });
  }

  /**
   * Registers a callback invoked when a new client connects.
   * @param callback - Receives the raw `net.Socket` for the new client connection.
   */
  public onConnection(callback: (socket: net.Socket) => void) {
    this.onConnectionCallback = callback;
  }

  /**
   * Registers a callback invoked when data arrives from any client.
   * @param callback - Receives the source socket and the raw data Buffer.
   *
   * NOTE: TCP is a stream protocol. A single `send()` call from the client
   * may arrive as multiple `'data'` events (packet fragmentation), or multiple
   * sends may be coalesced into one event (Nagle's algorithm before TCP_NODELAY).
   * Applications must implement their own message framing (e.g., length-prefix or delimiter).
   */
  public onData(callback: (socket: net.Socket, data: Buffer) => void) {
    this.onDataCallback = callback;
  }

  /**
   * Registers a callback invoked when a client disconnects.
   * @param callback - Receives the socket that has been closed.
   *
   * This fires for both graceful (FIN handshake) and abrupt (RST / network drop) closures.
   */
  public onClose(callback: (socket: net.Socket) => void) {
    this.onCloseCallback = callback;
  }

  /**
   * Returns the number of currently active (connected) client sockets.
   * Useful for monitoring connection pools and enforcing connection limits.
   */
  public getActiveConnectionsCount(): number {
    return this.activeSockets.size;
  }
}

/**
 * @class TCPClient
 * @description A low-level TCP client wrapper built on Node.js `net.Socket`.
 *
 * WHY IT EXISTS:
 * Encapsulates raw socket creation, backpressure-aware writes, and graceful teardown.
 * Higher-level clients (HTTP clients, database drivers) build on top of this pattern.
 *
 * CONTRACT ENFORCED:
 * - `setNoDelay(true)` must be called immediately after socket creation to disable
 *   Nagle's algorithm for latency-sensitive use cases.
 * - `send()` MUST implement backpressure: if `socket.write()` returns `false`,
 *   the caller must await the `'drain'` event before resolving. Ignoring this
 *   causes the OS write buffer to overflow, eventually causing silent data drops
 *   or OOM crashes.
 * - All socket errors must be caught and forwarded to the error handler.
 */
export class TCPClient {
  private socket: net.Socket | null = null;
  private onDataCallback: ((data: Buffer) => void) | null = null;
  private onDisconnectCallback: (() => void) | null = null;

  constructor() {}

  /**
   * Establishes a TCP connection to the specified server.
   *
   * WHAT IT SHOULD DO:
   * 1. Create a new `net.Socket()`.
   * 2. Call `socket.setNoDelay(true)` — disable Nagle's algorithm.
   * 3. Register event handlers:
   *    - `'connect'`: Store the socket reference and call `resolve()`.
   *    - `'data'`: Forward raw Buffer to `onDataCallback`.
   *    - `'close'`: Invoke `onDisconnectCallback`.
   *    - `'error'`: Call `reject(err)` during connection; after connected, log or re-emit.
   * 4. Call `socket.connect(port, host)` to initiate the 3-way handshake.
   *
   * @param port - The server port to connect to.
   * @param host - The server IP address. Defaults to `127.0.0.1`.
   * @returns A Promise that resolves when the TCP handshake completes (`ESTABLISHED`).
   *
   * EDGE CASES:
   * - If the server is not listening, reject with `ECONNREFUSED`.
   * - If the host is unreachable, reject with `ETIMEDOUT` after OS timeout.
   */
  public connect(port: number, host: string = '127.0.0.1'): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = new net.Socket();
      socket.setNoDelay(true);
      let connected = false;

      socket.on('connect', () => {
        connected = true;
        this.socket = socket;
        resolve();
      });

      socket.on('data', (data) => {
        if (this.onDataCallback) {
          this.onDataCallback(data);
        }
      });

      socket.on('close', () => {
        this.socket = null;
        if (this.onDisconnectCallback) {
          this.onDisconnectCallback();
        }
      });

      socket.on('error', (err) => {
        if (!connected) {
          reject(err);
        }
      });

      socket.connect(port, host);
    });
  }

  /**
   * Writes data to the socket with full backpressure awareness.
   *
   * WHAT IT SHOULD DO:
   * 1. Guard: if `socket` is null or destroyed, reject with `Error('Not connected')`.
   * 2. Call `this.socket.write(data)`:
   *    - Returns `true` if the OS kernel buffer has space → resolve immediately.
   *    - Returns `false` if the OS kernel write buffer is FULL (backpressure signal):
   *      → Register a ONE-TIME `'drain'` event listener to resolve when the buffer empties.
   *      → Do NOT resolve until drain fires.
   * 3. Handle the `'error'` callback of `socket.write()` to reject on write failure.
   *
   * @param data - A string (UTF-8 encoded) or raw Buffer to send to the server.
   * @returns A Promise that resolves when the data has been accepted by the OS kernel buffer.
   *
   * EDGE CASES:
   * - Very large data chunks will likely cause `write()` to return `false` immediately.
   * - Multiple concurrent calls to `send()` without awaiting will cause race conditions
   *   on the drain event. Serialize sends if needed.
   *
   * PRODUCTION ANALOGY:
   * Think of this like filling a garden hose. You can pour water (write data) as fast
   * as the hose (OS buffer) can absorb it. If it's full, you wait (drain) before pouring more.
   */
  public send(data: string | Buffer): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Not connected'));
        return;
      }

      const success = this.socket.write(data, (err) => {
        if (err) {
          reject(err);
        }
      });

      if (!success) {
        this.socket.once('drain', () => {
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  /**
   * Gracefully closes the connection by sending a TCP FIN packet.
   *
   * WHAT IT SHOULD DO:
   * 1. Call `socket.end()` — sends a FIN to the server (half-close the write side).
   * 2. The server's `'close'` event fires once both sides have finished closing.
   *
   * NOTE: Unlike `socket.destroy()` which sends RST (immediate abort),
   * `socket.end()` allows in-flight data to be received by the server first.
   *
   * EDGE CASES:
   * - If already disconnected (socket is null), resolve immediately without error.
   */
  public disconnect(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.socket) {
        resolve();
        return;
      }
      this.socket.end(() => {
        this.socket = null;
        resolve();
      });
    });
  }

  /**
   * Registers a callback invoked when data arrives from the server.
   * @param callback - Receives the raw Buffer of incoming server data.
   */
  public onData(callback: (data: Buffer) => void) {
    this.onDataCallback = callback;
  }

  /**
   * Registers a callback invoked when the connection is closed (server disconnect or error).
   * @param callback - Called when the socket transitions to the CLOSED state.
   */
  public onDisconnect(callback: () => void) {
    this.onDisconnectCallback = callback;
  }
}
