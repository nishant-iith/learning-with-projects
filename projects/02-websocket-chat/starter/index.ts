import * as net from 'net';
import * as crypto from 'crypto';

export class WebSocketServer {
  private server: net.Server | null = null;
  private clients: Set<net.Socket> = new Set();
  private onMessageCallback: ((sender: net.Socket, message: string) => void) | null = null;

  constructor() {}

  public start(port: number, host: string = '127.0.0.1'): Promise<void> {
    return new Promise((resolve, reject) => {
      // TODO: Create a net.Server that accepts HTTP upgrade requests.
      // TODO: Perform the WebSocket Handshake:
      //   - Extract the 'Sec-WebSocket-Key' header.
      //   - Append the magic string '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'.
      //   - Hash using SHA-1 and encode in Base64.
      //   - Respond with a '101 Switching Protocols' header.
      // TODO: Once upgraded, process incoming WebSocket data frames.
      // TODO: Implement frame decoding: unmasking payloads using XOR bitwise formula.
      // TODO: Handle Close (0x8), Ping (0x9) -> Pong (0xA) heartbeats.
      reject(new Error('WebSocketServer.start is not implemented'));
    });
  }

  public stop(): Promise<void> {
    return new Promise((resolve) => {
      // TODO: Terminate server and destroy all client sockets
      resolve();
    });
  }

  public broadcast(message: string, excludeSocket?: net.Socket) {
    // TODO: Construct a raw WebSocket text frame (opcode 0x1) with the message payload
    // TODO: Write the frame to all client sockets except the sender (excludeSocket)
  }

  public onMessage(callback: (sender: net.Socket, message: string) => void) {
    this.onMessageCallback = callback;
  }

  public static generateAcceptKey(clientKey: string): string {
    // TODO: Hash Sec-WebSocket-Key concatenated with magic string using SHA-1
    // TODO: Return Base64 encoded hash string
    throw new Error('generateAcceptKey is not implemented');
  }

  public static decodeFrame(buffer: Buffer): { opcode: number; payload: string | null } {
    // TODO: Extract FIN, Opcode, Mask flag, and Payload Length from first 2 bytes
    // TODO: Parse actual payload length (handle 126 and 127 byte extensions)
    // TODO: Extract Masking Key (4 bytes) if Mask flag is 1
    // TODO: Decode payload using XOR masking formula: OriginalByte_i = MaskedByte_i ^ MaskingKey_(i % 4)
    throw new Error('decodeFrame is not implemented');
  }

  public static encodeFrame(payload: string): Buffer {
    // TODO: Construct a standard WebSocket text frame (opcode 0x1)
    // TODO: Write FIN and Opcode flags (0x81)
    // TODO: Encode payload length without masking (servers to clients frames must NOT be masked!)
    // TODO: Append raw payload bytes
    throw new Error('encodeFrame is not implemented');
  }
}
