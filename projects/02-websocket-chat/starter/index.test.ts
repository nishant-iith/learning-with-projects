import { describe, it, expect } from 'vitest';
import { WebSocketServer } from './index.js';

describe('WebSocket Server Lab 02: WebSocket Handshake & Framing', () => {

  describe('WebSocket Handshake & Frame Utilities', () => {
    it('should generate a correct Sec-WebSocket-Accept key from Sec-WebSocket-Key', () => {
      // Standard example from RFC 6455
      const clientKey = 'dGhlIHNhbXBsZSBub25jZQ==';
      const expectedAcceptKey = 's3pPLMBiTxaQ9kYGzzhZRbK+xOo=';
      expect(WebSocketServer.generateAcceptKey(clientKey)).toBe(expectedAcceptKey);
    });

    it('should encode a text frame correctly (unmasked)', () => {
      const message = 'Hello';
      const frame = WebSocketServer.encodeFrame(message);
      
      expect(frame[0]).toBe(0x81); // FIN + Text opcode
      expect(frame[1]).toBe(5);    // Length (5), Unmasked
      expect(frame.subarray(2).toString()).toBe('Hello');
    });

    it('should decode a masked text frame correctly', () => {
      // "Hello" masked with key [0x37, 0xfa, 0x21, 0x3d]
      // Masked payload: Hello bytes ^ Key bytes
      // H: 0x48 ^ 0x37 = 0x7f
      // e: 0x65 ^ 0xfa = 0x9f
      // l: 0x6c ^ 0x21 = 0x4d
      // l: 0x6c ^ 0x3d = 0x51
      // o: 0x6f ^ 0x37 = 0x58
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
  });
});
