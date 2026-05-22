import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as net from 'net';
import { WebSocketServer } from './index.js';

/**
 * TDD Test Suite: Lab 02 — WebSocket Handshake & Framing
 *
 * These tests cover the complete WebSocket protocol mechanics:
 *   - SHA-1 + Base64 accept key generation (RFC 6455 test vector)
 *   - Text frame encoding (server-to-client, unmasked)
 *   - Masked frame decoding (client-to-server, XOR unmask)
 *   - Large payload length encoding (>125 bytes)
 *   - Close frame handling (opcode 0x8)
 *   - Ping/Pong frame opcode recognition
 *   - Edge cases: empty payload, max 7-bit length boundary
 */
describe('WebSocket Server Lab 02: WebSocket Handshake & Framing', () => {

  describe('WebSocket Handshake & Frame Utilities', () => {
    it('should generate a correct Sec-WebSocket-Accept key from Sec-WebSocket-Key', () => {
      /**
       * SCENARIO: Standard RFC 6455 test vector for the accept key derivation.
       * EXPECTED: SHA-1(key + magic) encoded as Base64 matches the exact RFC value.
       * VERIFIES: Correct concatenation order, SHA-1 algorithm, Base64 encoding.
       *
       * If this test fails, ALL WebSocket handshakes will be rejected by browsers.
       * This is the most critical test in the suite.
       */
      const clientKey = 'dGhlIHNhbXBsZSBub25jZQ==';
      const expectedAcceptKey = 's3pPLMBiTxaQ9kYGzzhZRbK+xOo=';
      expect(WebSocketServer.generateAcceptKey(clientKey)).toBe(expectedAcceptKey);
    });

    it('should encode a text frame correctly (unmasked server frame)', () => {
      /**
       * SCENARIO: Server encodes "Hello" into a WebSocket text frame.
       * EXPECTED:
       *   - Byte 0 = 0x81 (FIN=1 + opcode=0x1 Text)
       *   - Byte 1 = 5 (payload length, no mask bit)
       *   - Bytes 2-6 = UTF-8 bytes of "Hello"
       * VERIFIES: encodeFrame produces RFC 6455-compliant server frames.
       *
       * CRITICAL: Mask bit (bit 7 of byte 1) MUST be 0. A browser receiving
       * a masked server frame will close the connection with protocol error 1002.
       */
      const message = 'Hello';
      const frame = WebSocketServer.encodeFrame(message);
      
      expect(frame[0]).toBe(0x81); // FIN + Text opcode
      expect(frame[1]).toBe(5);    // Length (5), Unmasked (bit 7 = 0)
      expect(frame.subarray(2).toString()).toBe('Hello');
    });

    it('should decode a masked text frame correctly', () => {
      /**
       * SCENARIO: Client sends "Hello" masked with key [0x37, 0xfa, 0x21, 0x3d].
       * EXPECTED: Decoded payload equals "Hello", opcode equals 1 (text).
       * VERIFIES: XOR unmasking loop — every byte XORed with maskKey[i % 4].
       *
       * Byte-by-byte breakdown:
       *   H (0x48) ^ 0x37 = 0x7F
       *   e (0x65) ^ 0xFA = 0x9F
       *   l (0x6C) ^ 0x21 = 0x4D
       *   l (0x6C) ^ 0x3D = 0x51
       *   o (0x6F) ^ 0x37 = 0x58
       */
      const frameBuffer = Buffer.from([
        0x81, // FIN + Text opcode
        0x85, // Mask flag (1) + Payload length (5)
        0x37, 0xfa, 0x21, 0x3d, // Masking Key
        0x7f, 0x9f, 0x4d, 0x51, 0x58 // Masked Payload
      ]);

      const decoded = WebSocketServer.decodeFrame(frameBuffer);
      expect(decoded.opcode).toBe(1);
      expect(decoded.payload).toBe('Hello');
    });

    it('should decode a frame with extended 16-bit payload length (>125 bytes)', () => {
      /**
       * SCENARIO: Frame with payload length = 200 bytes, encoded as 16-bit extension.
       * EXPECTED: payloadLength correctly parsed as 200 from the 2 extended bytes.
       * VERIFIES: Extended length parsing when byte1 & 0x7F === 126.
       *
       * Frame structure for 200-byte payload:
       *   Byte 0: 0x81 (FIN + text)
       *   Byte 1: 0xFE (mask=1, length=126 → 16-bit extension follows)
       *   Byte 2-3: 0x00, 0xC8 (200 as UInt16BE)
       *   Byte 4-7: masking key
       *   Byte 8+:  200 masked payload bytes (all zeros for simplicity)
       */
      const payloadContent = 'A'.repeat(200);
      const payloadBytes = Buffer.from(payloadContent, 'utf8');
      const maskKey = Buffer.from([0x00, 0x00, 0x00, 0x00]); // Identity mask for test
      const maskedPayload = Buffer.from(payloadBytes.map((b, i) => b ^ maskKey[i % 4]));
      
      const frame = Buffer.concat([
        Buffer.from([0x81, 0xFE, 0x00, 0xC8]), // FIN+text, 126=extended, length=200
        maskKey,
        maskedPayload
      ]);

      const decoded = WebSocketServer.decodeFrame(frame);
      expect(decoded.opcode).toBe(1);
      expect(decoded.payload?.length).toBe(200);
      expect(decoded.payload).toBe(payloadContent);
    });

    it('should recognize a Ping frame (opcode 0x9)', () => {
      /**
       * SCENARIO: Browser sends a Ping control frame.
       * EXPECTED: Decoded opcode is 9 (0x9), payload is null or empty.
       * VERIFIES: Control frame opcode recognition — required for heartbeat handling.
       *
       * PRODUCTION RELEVANCE: Unhandled Ping frames cause browsers to consider
       * the connection dead and attempt reconnection storms.
       */
      const pingFrame = Buffer.from([
        0x89, // FIN + Ping (opcode 0x9)
        0x80, // Mask=1, payload length=0
        0x00, 0x00, 0x00, 0x00 // Masking key (zeros, since no payload)
      ]);

      const decoded = WebSocketServer.decodeFrame(pingFrame);
      expect(decoded.opcode).toBe(9); // 0x9 = Ping
    });

    it('should recognize a Close frame (opcode 0x8)', () => {
      /**
       * SCENARIO: Browser sends a graceful Close frame.
       * EXPECTED: Decoded opcode is 8 (0x8).
       * VERIFIES: Close frame detection — server must echo Close before destroying socket.
       *
       * EDGE CASE: Failing to echo Close causes browsers to show "WebSocket closed abnormally"
       * and may trigger automatic reconnect storms in production.
       */
      const closeFrame = Buffer.from([
        0x88, // FIN + Close (opcode 0x8)
        0x80, // Mask=1, payload length=0
        0x00, 0x00, 0x00, 0x00 // Masking key
      ]);

      const decoded = WebSocketServer.decodeFrame(closeFrame);
      expect(decoded.opcode).toBe(8); // 0x8 = Close
    });

    it('should encode an empty string as a valid 2-byte frame header', () => {
      /**
       * SCENARIO: Server broadcasts an empty string message.
       * EXPECTED: Frame has FIN+Text opcode (0x81), length byte is 0, no payload bytes.
       * VERIFIES: Edge case — zero-length payload encoding.
       */
      const frame = WebSocketServer.encodeFrame('');
      expect(frame[0]).toBe(0x81); // FIN + Text opcode
      expect(frame[1]).toBe(0);    // Zero length, no mask
      expect(frame.length).toBe(2); // Just the 2-byte header
    });

    it('should encode a 126-byte message with extended length header', () => {
      /**
       * SCENARIO: Server sends a message exactly 126 bytes long.
       * EXPECTED: Byte 1 = 126 (0x7E), followed by 2 bytes of UInt16BE length.
       * VERIFIES: Extended length encoding threshold boundary (>=126 uses 16-bit extension).
       */
      const payload = 'X'.repeat(126);
      const frame = WebSocketServer.encodeFrame(payload);
      
      expect(frame[0]).toBe(0x81);  // FIN + Text
      expect(frame[1]).toBe(126);   // Length indicator for 16-bit extension
      // Next 2 bytes encode actual length (126) as UInt16BE
      const len = frame.readUInt16BE(2);
      expect(len).toBe(126);
    });

    it('should not set the mask bit on server-to-client frames', () => {
      /**
       * SCENARIO: Server encodes any message.
       * EXPECTED: Bit 7 of byte 1 (mask bit) MUST be 0.
       * VERIFIES: RFC 6455 §5.1 — only clients mask frames, never servers.
       *
       * ANTI-PATTERN: Setting mask=1 on server frames causes protocol error 1002.
       */
      const frame = WebSocketServer.encodeFrame('Test message from server');
      const maskBit = (frame[1] >> 7) & 1;
      expect(maskBit).toBe(0); // No mask on server frames!
    });
  });

  describe('WebSocket Server Integration', () => {
    let wsServer: WebSocketServer;
    const PORT = 9001;
    const HOST = '127.0.0.1';

    beforeEach(async () => {
      wsServer = new WebSocketServer();
      await wsServer.start(PORT, HOST);
    });

    afterEach(async () => {
      await wsServer.stop();
    });

    it('should complete HTTP Upgrade WebSocket handshake successfully', () => {
      return new Promise<void>((resolve, reject) => {
        const client = net.createConnection({ port: PORT, host: HOST }, () => {
          client.write(
            "GET /chat HTTP/1.1\r\n" +
            "Host: 127.0.0.1:9001\r\n" +
            "Upgrade: websocket\r\n" +
            "Connection: Upgrade\r\n" +
            "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n" +
            "Sec-WebSocket-Version: 13\r\n\r\n"
          );
        });

        let data = '';
        client.on('data', (chunk) => {
          data += chunk.toString();
          if (data.includes('\r\n\r\n')) {
            expect(data).toContain('HTTP/1.1 101 Switching Protocols');
            expect(data).toContain('Upgrade: websocket');
            expect(data).toContain('Connection: Upgrade');
            expect(data).toContain('Sec-WebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK+xOo=');
            client.destroy();
            resolve();
          }
        });

        client.on('error', reject);
      });
    });

    it('should route messages between clients (broadcast)', () => {
      return new Promise<void>((resolve, reject) => {
        let client1Upgrade = false;
        let client2Upgrade = false;

        const client1 = net.createConnection({ port: PORT, host: HOST }, () => {
          client1.write(
            "GET /chat HTTP/1.1\r\n" +
            "Host: 127.0.0.1:9001\r\n" +
            "Upgrade: websocket\r\n" +
            "Connection: Upgrade\r\n" +
            "Sec-WebSocket-Key: client1key==\r\n" +
            "Sec-WebSocket-Version: 13\r\n\r\n"
          );
        });

        const client2 = net.createConnection({ port: PORT, host: HOST }, () => {
          client2.write(
            "GET /chat HTTP/1.1\r\n" +
            "Host: 127.0.0.1:9001\r\n" +
            "Upgrade: websocket\r\n" +
            "Connection: Upgrade\r\n" +
            "Sec-WebSocket-Key: client2key==\r\n" +
            "Sec-WebSocket-Version: 13\r\n\r\n"
          );
        });

        client1.on('data', (chunk) => {
          if (!client1Upgrade) {
            if (chunk.toString().includes('101 Switching Protocols')) {
              client1Upgrade = true;
              // Now client1 is connected. Wait a bit then client1 sends a masked frame "Hello"
              setTimeout(() => {
                const frameBuffer = Buffer.from([
                  0x81, // FIN + Text opcode
                  0x85, // Mask flag (1) + Payload length (5)
                  0x12, 0x34, 0x56, 0x78, // Masking Key
                  0x48 ^ 0x12, 0x65 ^ 0x34, 0x6c ^ 0x56, 0x6c ^ 0x78, 0x6f ^ 0x12 // Masked "Hello"
                ]);
                client1.write(frameBuffer);
              }, 100);
            }
          }
        });

        let client2Data = Buffer.alloc(0);
        client2.on('data', (chunk) => {
          if (!client2Upgrade) {
            if (chunk.toString().includes('101 Switching Protocols')) {
              client2Upgrade = true;
              // Slice off the handshake HTTP header
              const upgradeStr = chunk.toString();
              const idx = upgradeStr.indexOf('\r\n\r\n');
              chunk = chunk.subarray(idx + 4);
            }
          }
          if (client2Upgrade && chunk.length > 0) {
            client2Data = Buffer.concat([client2Data, chunk]);
            if (client2Data.length >= 7) {
              const decoded = WebSocketServer.decodeFrame(client2Data);
              expect(decoded.opcode).toBe(1);
              expect(decoded.payload).toBe('Hello');
              client1.destroy();
              client2.destroy();
              resolve();
            }
          }
        });

        client1.on('error', reject);
        client2.on('error', reject);
      });
    });

    it('should reply with Pong when client sends Ping', () => {
      return new Promise<void>((resolve, reject) => {
        let isUpgraded = false;
        const client = net.createConnection({ port: PORT, host: HOST }, () => {
          client.write(
            "GET /chat HTTP/1.1\r\n" +
            "Host: 127.0.0.1:9001\r\n" +
            "Upgrade: websocket\r\n" +
            "Connection: Upgrade\r\n" +
            "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n" +
            "Sec-WebSocket-Version: 13\r\n\r\n"
          );
        });

        client.on('data', (chunk) => {
          if (!isUpgraded) {
            if (chunk.toString().includes('101 Switching Protocols')) {
              isUpgraded = true;
              // Send ping frame
              const pingFrame = Buffer.from([
                0x89, // FIN + Ping opcode
                0x80, // Mask = 1, length = 0
                0x11, 0x22, 0x33, 0x44 // Mask key
              ]);
              client.write(pingFrame);
            }
          } else {
            // Should receive Pong frame (opcode 0xA, 0x8A)
            expect(chunk[0]).toBe(0x8A);
            expect(chunk[1]).toBe(0x00); // Server to client, unmasked, length = 0
            client.destroy();
            resolve();
          }
        });

        client.on('error', reject);
      });
    });
  });
});

