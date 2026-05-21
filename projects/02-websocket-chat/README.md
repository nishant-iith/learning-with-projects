# 🔬 Lab 02: WebSocket Chat Broker from Scratch

In this laboratory, you will build a real-time, bi-directional communication server: **WebSockets** (standardized in **RFC 6455**). You will implement the low-level HTTP handshake upgrade, parse raw binary framing buffers, unmask client payloads using bitwise XOR, and orchestrate a multi-user broadcast chat server.

---

## 1. 💡 The Core Concepts

Traditional HTTP is unidirectional—the client must pull data from the server. WebSockets allow **full-duplex**, persistent, low-overhead communication where either side can push data at any time down a single TCP connection.

### A. The Handshake (HTTP Upgrade)
A WebSocket connection begins as a standard HTTP/1.1 request containing upgrade headers:

```http
GET /chat HTTP/1.1
Host: localhost:8080
Upgrade: websocket
Connection: Upgrade
Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==
Sec-WebSocket-Version: 13
```

To accept the handshake, the server must:
1. Concatenate the client's `Sec-WebSocket-Key` with the globally standardized magic UUID string: `258EAFA5-E914-47DA-95CA-C5AB0DC85B11`.
2. Compute the **SHA-1 hash** of this concatenated string.
3. Encode the binary hash output into **Base62/Base64**.
4. Return a `101 Switching Protocols` response:

```http
HTTP/1.1 101 Switching Protocols
Upgrade: websocket
Connection: Upgrade
Sec-WebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK+xOo=
```

---

### B. The WebSocket Binary Frame Protocol
Once the handshake completes, the connection switches from HTTP text format to the **WebSocket Framing Protocol**. Data is sent in binary packets called **Frames**.

```
  0                   1                   2                   3
  0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
 +-+-+-+-+-------+-+-------------+-------------------------------+
 |F|R|R|R| opcode|M|     payload |    Extended payload length    |
 |I|S|S|S|  (4b) |A|   len (7b)  |             (16/64)           |
 |N|V|V|V|       |S|             |   (if payload len==126/127)   |
 | |1|2|3|       |K|             |                               |
 +-+-+-+-+-------+-+-------------+ - - - - - - - - - - - - - - - +
 |     Masking-key (4 bytes, client-to-server frames only)       |
 +-------------------------------+ - - - - - - - - - - - - - - - +
 |                          Payload Data                         |
 +---------------------------------------------------------------+
```

- **FIN (Bit 0)**: Indicates if this is the final fragment of the message (`1` = yes).
- **Opcode (Bits 4-7)**: The type of frame:
  - `0x1`: Text Frame.
  - `0x2`: Binary Frame.
  - `0x8`: Connection Close.
  - `0x9`: Ping.
  - `0xA`: Pong (Heartbeat response).
- **MASK (Bit 8)**: Specifies if the payload is masked (`1` = yes). **All client-to-server frames MUST be masked!** Sockets must drop unmasked client frames to prevent cache poisoning attacks.
- **Payload Length (Bits 9-15)**:
  - If `< 126`: The actual payload length.
  - If `== 126`: Next 2 bytes represent the length as a 16-bit unsigned integer.
  - If `== 127`: Next 8 bytes represent the length as a 64-bit unsigned integer.
- **Masking Key**: 4 bytes of random data.
- **Payload Data**: To extract the actual text or binary, you must unmask every byte using bitwise XOR:
  $$\text{OriginalByte}_i = \text{MaskedByte}_i \oplus \text{MaskingKey}_{i \bmod 4}$$

---

## 2. 🌍 Real-Life Production Applications

WebSockets power the real-time web:
- **Collaborative Whiteboards & Editors**: Figma, Google Docs, Notion.
- **Financial Trading Platforms**: Pushing real-time stock and crypto tickers down to web dashboards.
- **Push Notification Brokers**: Maintaining millions of persistent connections in companies like WhatsApp to push immediate notifications with minimal overhead.

---

## 3. ⚙️ Advanced System Design Add-Ons

### A. Connection Scaling (Millions of Connections)
- WebSockets are **stateful**. Unlike stateless HTTP where request/response cycles end, a WebSocket socket remains open. 
- If a server has 100,000 active clients, it must maintain 100,000 open file descriptors.
- **The Solution**: Event-driven I/O models (like epoll in Linux) and highly scalable reverse proxies (like HAProxy or AWS ALB) to offload connection management.

### B. Heartbeats & Disconnect Detection
If a client socket drops silently (e.g. WiFi disconnects), the TCP socket might not notice immediately.
- **The Solution**: **Ping/Pong Heartbeats**.
- The server periodically sends a `Ping` frame (`0x9`). The client's browser is hardcoded by the spec to immediately return a `Pong` frame (`0xA`). If the server doesn't receive a Pong within a timeout window, it terminates the socket.

---

## 🛠️ Laboratory Challenge: Implement a WebSocket Server

### The Goal
Build a raw WebSocket server that upgrades connections, unmasks payloads, handles ping/pong frame loops, and implements a multi-user real-time chat room. You will:
1. Accept incoming HTTP upgrade requests and return compliant `101 Switching Protocols` headers with correct SHA-1 keys.
2. Read binary buffers and parse frame headers (opcodes, masking flags, payload boundaries).
3. Apply the **XOR bitwise masking formula** to extract payloads.
4. Broadcast incoming chat messages to all other connected client sockets.
5. Manage connections by responding to browser Ping events and handling graceful Close frames (`0x8`).
