import * as net from 'net';
import * as crypto from 'crypto';

/**
 * @class WebSocketServer
 * @description A raw, RFC 6455-compliant WebSocket server built on Node.js `net.Server`.
 *
 * WHY IT EXISTS:
 * Demonstrates the exact mechanics that every WebSocket library (ws, socket.io, uWebSockets.js)
 * performs internally. Understanding this layer is essential for debugging WebSocket
 * protocol errors, implementing custom frame extensions, and scaling WS connections.
 *
 * CONTRACT ENFORCED:
 * - Every upgrade handshake MUST use the exact SHA-1 + Base64 + MagicUUID formula from RFC 6455.
 * - All incoming client frames MUST be XOR-unmasked before processing.
 * - Server-to-client frames MUST NOT be masked (RFC 6455 §5.1).
 * - Ping frames (0x9) MUST be answered with a Pong frame (0xA) immediately.
 * - Close frames (0x8) MUST be echoed before the socket is destroyed.
 * - Silent half-open connections MUST be detected via periodic Ping/Pong heartbeats.
 */
export class WebSocketServer {
  private server: net.Server | null = null;
  private clients: Set<net.Socket> = new Set();
  private onMessageCallback: ((sender: net.Socket, message: string) => void) | null = null;

  constructor() {}

  /**
   * Starts the WebSocket server and handles the full HTTP Upgrade → WS lifecycle.
   *
   * WHAT IT SHOULD DO:
   * 1. Create a `net.Server` to accept raw TCP connections.
   * 2. On each connection, buffer incoming bytes until the HTTP upgrade headers are complete.
   * 3. Extract the `Sec-WebSocket-Key` header from the raw HTTP request.
   * 4. Call `WebSocketServer.generateAcceptKey(key)` to compute the `Sec-WebSocket-Accept` value.
   * 5. Send the `101 Switching Protocols` response:
   *    ```
   *    HTTP/1.1 101 Switching Protocols\r\n
   *    Upgrade: websocket\r\n
   *    Connection: Upgrade\r\n
   *    Sec-WebSocket-Accept: <acceptKey>\r\n
   *    \r\n
   *    ```
   * 6. Add the socket to `this.clients` and switch to WebSocket frame mode.
   * 7. On subsequent data events, call `WebSocketServer.decodeFrame(buffer)`:
   *    - opcode `0x1` (Text): Invoke `onMessageCallback`, then broadcast.
   *    - opcode `0x8` (Close): Echo a Close frame, destroy socket, remove from clients.
   *    - opcode `0x9` (Ping): Send a Pong frame (opcode `0xA`).
   * 8. Handle socket `'error'` events to prevent process crashes.
   *
   * @param port - TCP port to listen on.
   * @param host - Network interface to bind to (default: `127.0.0.1`).
   * @returns Promise that resolves when the server is listening.
   *
   * EDGE CASES:
   * - If a non-WebSocket HTTP request arrives (no Upgrade header), return 400 and close.
   * - If the socket dies mid-stream (before handshake complete), destroy it safely.
   */
  public start(port: number, host: string = '127.0.0.1'): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.server = net.createServer((socket) => {
          let isUpgraded = false;
          let rawBuffer = Buffer.alloc(0);

          socket.on('close', () => {
            this.clients.delete(socket);
          });

          socket.on('error', (err) => {
            socket.destroy();
            this.clients.delete(socket);
          });

          socket.on('data', (chunk) => {
            rawBuffer = Buffer.concat([rawBuffer, chunk]);

            if (!isUpgraded) {
              const reqStr = rawBuffer.toString('utf8');
              const boundaryIdx = reqStr.indexOf('\r\n\r\n');
              if (boundaryIdx === -1) {
                return; // Wait for headers
              }

              const headersBlock = reqStr.substring(0, boundaryIdx);
              const lines = headersBlock.split('\r\n');

              let wsKey = '';
              let isUpgradeRequested = false;

              for (let i = 1; i < lines.length; i++) {
                const colon = lines[i].indexOf(':');
                if (colon === -1) continue;
                const key = lines[i].substring(0, colon).trim().toLowerCase();
                const val = lines[i].substring(colon + 1).trim();
                if (key === 'sec-websocket-key') {
                  wsKey = val;
                }
                if (key === 'upgrade' && val.toLowerCase() === 'websocket') {
                  isUpgradeRequested = true;
                }
              }

              if (!isUpgradeRequested || !wsKey) {
                const res = 
                  "HTTP/1.1 400 Bad Request\r\n" +
                  "Connection: close\r\n\r\n";
                socket.write(res, () => {
                  socket.destroy();
                });
                return;
              }

              const acceptKey = WebSocketServer.generateAcceptKey(wsKey);
              const response = 
                "HTTP/1.1 101 Switching Protocols\r\n" +
                "Upgrade: websocket\r\n" +
                "Connection: Upgrade\r\n" +
                `Sec-WebSocket-Accept: ${acceptKey}\r\n\r\n`;

              socket.write(response);
              isUpgraded = true;
              this.clients.add(socket);

              rawBuffer = rawBuffer.subarray(boundaryIdx + 4);
            }

            while (rawBuffer.length >= 2) {
              const secondByte = rawBuffer[1];
              const isMasked = (secondByte & 0x80) !== 0;
              let payloadLen = secondByte & 0x7F;
              let offset = 2;

              if (payloadLen === 126) {
                if (rawBuffer.length < 4) break;
                payloadLen = rawBuffer.readUInt16BE(offset);
                offset += 2;
              } else if (payloadLen === 127) {
                if (rawBuffer.length < 10) break;
                payloadLen = Number(rawBuffer.readBigUInt64BE(offset));
                offset += 8;
              }

              const maskBytesNeeded = isMasked ? 4 : 0;
              const requiredLength = offset + maskBytesNeeded + payloadLen;

              if (rawBuffer.length < requiredLength) {
                break; // Complete frame has not arrived yet
              }

              const frameBytes = rawBuffer.subarray(0, requiredLength);
              rawBuffer = rawBuffer.subarray(requiredLength);

              try {
                const decoded = WebSocketServer.decodeFrame(frameBytes);

                if (decoded.opcode === 0x1) {
                  if (decoded.payload !== null) {
                    if (this.onMessageCallback) {
                      this.onMessageCallback(socket, decoded.payload);
                    }
                    this.broadcast(decoded.payload, socket);
                  }
                } else if (decoded.opcode === 0x8) {
                  const closeFrame = Buffer.from([0x88, 0x00]);
                  socket.write(closeFrame, () => {
                    socket.destroy();
                    this.clients.delete(socket);
                  });
                } else if (decoded.opcode === 0x9) {
                  const pongFrame = Buffer.from([0x8A, 0x00]);
                  socket.write(pongFrame);
                }
              } catch (e) {
                socket.destroy();
                this.clients.delete(socket);
              }
            }
          });
        });

        this.server.on('error', (err) => {
          reject(err);
        });

        this.server.listen(port, host, () => {
          resolve();
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Gracefully shuts down the WebSocket server.
   *
   * WHAT IT SHOULD DO:
   * 1. Send a Close frame (opcode `0x8`) to each connected client.
   * 2. Destroy all client sockets to free file descriptors.
   * 3. Call `server.close()` to release the listening socket.
   *
   * EDGE CASES:
   * - If a socket is already destroyed, calling `socket.destroy()` is a safe no-op.
   * - Clear the `clients` Set after destroying all sockets.
   */
  public stop(): Promise<void> {
    return new Promise((resolve) => {
      const closeFrame = Buffer.from([0x88, 0x00]);
      for (const client of this.clients) {
        client.write(closeFrame, () => {
          client.destroy();
        });
      }
      this.clients.clear();
      
      if (this.server) {
        this.server.close(() => {
          resolve();
        });
        this.server = null;
      } else {
        resolve();
      }
    });
  }

  /**
   * Broadcasts a text message to all connected clients, optionally excluding the sender.
   *
   * WHAT IT SHOULD DO:
   * 1. Call `WebSocketServer.encodeFrame(message)` to construct the binary text frame.
   * 2. Iterate over `this.clients` and write the frame buffer to each socket.
   * 3. Skip the socket matching `excludeSocket` (don't echo back to the sender).
   * 4. Handle per-socket write errors gracefully (remove errored sockets from the Set).
   *
   * @param message - The UTF-8 text message to broadcast.
   * @param excludeSocket - Optional socket to skip (typically the sender).
   *
   * EDGE CASES:
   * - If `clients` is empty, this is a no-op.
   * - If a client socket is half-closed, `socket.write()` may throw. Catch and destroy.
   */
  public broadcast(message: string, excludeSocket?: net.Socket) {
    const frame = WebSocketServer.encodeFrame(message);
    for (const client of this.clients) {
      if (client === excludeSocket) continue;
      client.write(frame, (err) => {
        if (err) {
          client.destroy();
          this.clients.delete(client);
        }
      });
    }
  }

  /**
   * Registers a callback for incoming text messages.
   * @param callback - Called with the sender socket and decoded UTF-8 message string.
   */
  public onMessage(callback: (sender: net.Socket, message: string) => void) {
    this.onMessageCallback = callback;
  }

  /**
   * Generates a RFC 6455-compliant `Sec-WebSocket-Accept` header value.
   *
   * WHAT IT SHOULD DO:
   * 1. Concatenate `clientKey` with the hardcoded magic string:
   *    `'258EAFA5-E914-47DA-95CA-C5AB0DC85B11'`
   * 2. Compute the SHA-1 hash of the concatenated string using `crypto.createHash('sha1')`.
   * 3. Return the Base64-encoded binary hash using `.digest('base64')`.
   *
   * @param clientKey - The `Sec-WebSocket-Key` header value from the client's upgrade request.
   * @returns The `Sec-WebSocket-Accept` header value to send in the `101` response.
   *
   * RFC 6455 Standard Test Vector:
   * - Input:  `'dGhlIHNhbXBsZSBub25jZQ=='`
   * - Output: `'s3pPLMBiTxaQ9kYGzzhZRbK+xOo='`
   *
   * WHY SHA-1?
   * The protocol uses SHA-1 (not for security — it's a 2011 standard) purely as a
   * challenge-response proof that the server explicitly understands the WebSocket upgrade.
   * It prevents HTTP/1.1 proxies from accidentally caching upgrade responses.
   */
  public static generateAcceptKey(clientKey: string): string {
    const magic = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
    return crypto
      .createHash('sha1')
      .update(clientKey + magic)
      .digest('base64');
  }

  /**
   * Decodes an incoming masked WebSocket binary frame buffer.
   *
   * WHAT IT SHOULD DO:
   * 1. Read byte 0: extract `opcode = buffer[0] & 0x0F`.
   * 2. Read byte 1: extract `maskBit = (buffer[1] >> 7) & 1` and `payloadLen = buffer[1] & 0x7F`.
   * 3. Handle extended payload lengths:
   *    - `payloadLen === 126`: read next 2 bytes as UInt16BE for actual length; advance offset by 2.
   *    - `payloadLen === 127`: read next 8 bytes as UInt64 (use UInt32BE of last 4 bytes); advance by 8.
   * 4. If `maskBit === 1`: read 4 bytes as masking key; advance offset by 4.
   * 5. Extract payload bytes from `buffer.subarray(offset, offset + payloadLength)`.
   * 6. XOR-unmask each byte: `payload[i] ^= maskingKey[i % 4]`.
   * 7. Return `{ opcode, payload: payload.toString('utf8') }` for text frames; `null` for control frames.
   *
   * @param buffer - Raw binary Buffer received from the socket `'data'` event.
   * @returns An object with `opcode` (number) and `payload` (string or null).
   *
   * EDGE CASES:
   * - Control frames (Close, Ping, Pong) have empty payloads → return `null` for payload.
   * - Binary frames (opcode 0x2) → return raw bytes as null or handle separately.
   * - Fragmented messages (FIN bit = 0) require buffering continuation frames (out of scope for this lab).
   */
  public static decodeFrame(buffer: Buffer): { opcode: number; payload: string | null } {
    const opcode = buffer[0] & 0x0F;
    const isMasked = (buffer[1] & 0x80) !== 0;
    let payloadLen = buffer[1] & 0x7F;
    let offset = 2;

    if (payloadLen === 126) {
      payloadLen = buffer.readUInt16BE(offset);
      offset += 2;
    } else if (payloadLen === 127) {
      payloadLen = Number(buffer.readBigUInt64BE(offset));
      offset += 8;
    }

    let maskingKey: Buffer | null = null;
    if (isMasked) {
      maskingKey = buffer.subarray(offset, offset + 4);
      offset += 4;
    }

    const payloadBytes = buffer.subarray(offset, offset + payloadLen);

    if (opcode === 0x1) {
      // Text frame
      if (isMasked && maskingKey) {
        const unmasked = Buffer.alloc(payloadLen);
        for (let i = 0; i < payloadLen; i++) {
          unmasked[i] = payloadBytes[i] ^ maskingKey[i % 4];
        }
        return { opcode, payload: unmasked.toString('utf8') };
      } else {
        return { opcode, payload: payloadBytes.toString('utf8') };
      }
    } else {
      // Control frames or binary
      return { opcode, payload: null };
    }
  }

  /**
   * Encodes a text message string into a RFC 6455 WebSocket binary frame for server-to-client delivery.
   *
   * WHAT IT SHOULD DO:
   * 1. Byte 0: `0x81` = FIN bit (1) + Text opcode (0x1).
   * 2. Byte 1: payload length. If length < 126, write the length directly (no mask bit — servers don't mask).
   *            If length >= 126 but <= 65535: write `0x7E` (126), then 2 bytes UInt16BE of actual length.
   *            If length > 65535: write `0x7F` (127), then 8 bytes for actual length.
   * 3. Append raw UTF-8 payload bytes.
   * 4. Return the assembled Buffer.
   *
   * @param payload - The UTF-8 text message to encode into a WebSocket frame.
   * @returns A binary Buffer representing the complete WebSocket text frame.
   *
   * CRITICAL: Server-to-client frames MUST NOT be masked (no masking key, mask bit = 0).
   * Setting the mask bit on server frames causes the browser to close the connection
   * with a protocol error.
   *
   * EXAMPLE for "Hello" (5 bytes):
   * ```
   * Buffer: [0x81, 0x05, 0x48, 0x65, 0x6C, 0x6C, 0x6F]
   *          FIN+  len=5  H     e     l     l     o
   *          Text
   * ```
   */
  public static encodeFrame(payload: string): Buffer {
    const payloadBytes = Buffer.from(payload, 'utf8');
    const len = payloadBytes.length;
    let header: Buffer;

    if (len < 126) {
      header = Buffer.alloc(2);
      header[0] = 0x81;
      header[1] = len;
    } else if (len <= 65535) {
      header = Buffer.alloc(4);
      header[0] = 0x81;
      header[1] = 126;
      header.writeUInt16BE(len, 2);
    } else {
      header = Buffer.alloc(10);
      header[0] = 0x81;
      header[1] = 127;
      header.writeBigUInt64BE(BigInt(len), 2);
    }

    return Buffer.concat([header, payloadBytes]);
  }
}
