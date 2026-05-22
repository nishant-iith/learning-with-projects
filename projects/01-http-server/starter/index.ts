import * as net from 'net';

/**
 * @interface HTTPRequest
 * @description Represents a fully parsed HTTP/1.1 request.
 *
 * WHY IT EXISTS:
 * Raw TCP sockets deliver HTTP as a byte stream. This interface captures the
 * result of parsing that stream into a structured, type-safe object. It mirrors
 * the `req` object you're familiar with from Express.js or Fastify.
 *
 * FIELDS:
 * - `method`:  The HTTP verb in UPPERCASE (GET, POST, PUT, DELETE, PATCH, HEAD, OPTIONS).
 * - `path`:    The decoded URL path WITHOUT query string (e.g. "/users" from "/users?id=1").
 * - `query`:   Parsed query parameters as key-value pairs (e.g. { id: "1", page: "2" }).
 * - `headers`: Case-insensitive header map. Keys MUST be lowercased per RFC 7230.
 * - `body`:    The raw string body (may be JSON, form data, or binary-encoded text).
 */
export interface HTTPRequest {
  method: string;
  path: string;
  query: Record<string, string>;
  headers: Record<string, string>;
  body: string;
}

/**
 * @interface HTTPResponse
 * @description Represents the structured response data before byte serialization.
 *
 * WHY IT EXISTS:
 * Route handlers return this object instead of raw strings. The `formatResponse()`
 * method then serializes it into the exact byte format required by RFC 7230.
 *
 * FIELDS:
 * - `statusCode`: Numeric HTTP status (200, 201, 400, 404, 500, etc.).
 * - `statusText`: Human-readable status reason phrase ("OK", "Not Found", etc.).
 * - `headers`:    Response header map. Keys are title-cased (e.g. "Content-Type").
 * - `body`:       The response body string. Can be empty for 204 No Content.
 *
 * CRITICAL NOTE: The caller must set `Content-Length` using `Buffer.byteLength(body)`
 * (not `body.length`) to correctly handle multi-byte UTF-8 characters.
 */
export interface HTTPResponse {
  statusCode: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
}

/**
 * @class HTTPServer
 * @description A raw, RFC 7230-compliant HTTP/1.1 server built on top of `net.Server`.
 *
 * WHY IT EXISTS:
 * This class teaches the exact byte-level mechanics that every web framework
 * (Express, Fastify, Koa, Gin, Spring Boot) performs internally. Understanding
 * this layer is critical for debugging connection issues, performance tuning,
 * and implementing custom protocol handlers.
 *
 * CONTRACT ENFORCED:
 * - All header parsing MUST lowercase header keys (RFC 7230 case-insensitivity).
 * - Socket data MUST be buffered until the full `\r\n\r\n` boundary is found.
 * - `Connection: keep-alive` MUST be honoured: the socket must NOT be destroyed
 *   after sending one response. Subsequent requests on the same socket must be parsed.
 * - All socket errors MUST be caught to prevent process crashes.
 */
export class HTTPServer {
  private server: net.Server | null = null;
  private routes: Map<string, (req: HTTPRequest) => HTTPResponse> = new Map();
  private activeSockets: Set<net.Socket> = new Set();

  constructor() {}

  /**
   * Starts the HTTP server and begins accepting connections.
   *
   * WHAT IT SHOULD DO:
   * 1. Create a `net.Server` using `net.createServer()`.
   * 2. For each connection:
   *    a. Maintain a `buffer: string` variable to accumulate arriving chunks.
   *    b. On each `'data'` event: append `chunk.toString()` to the buffer.
   *    c. When `buffer.includes('\r\n\r\n')`:
   *       - Call `HTTPServer.parseRequest(buffer)` to get an `HTTPRequest`.
   *       - Look up the route in `this.routes`. If found, call the handler.
   *       - If not found, return a `404 Not Found` response.
   *       - Serialize the response using `HTTPServer.formatResponse()`.
   *       - Write the response bytes to the socket.
   *       - If `headers['connection'] === 'close'`, destroy the socket.
   *       - Otherwise, clear the buffer for the next request (keep-alive).
   * 3. Handle `'error'` events on each socket to prevent process crashes.
   * 4. Call `server.listen(port, host, () => resolve())`.
   *
   * @param port - Port to bind to (e.g. 8080).
   * @param host - Network interface to bind to (default: `'127.0.0.1'`).
   * @returns Promise that resolves when the server is actively listening.
   *
   * EDGE CASES:
   * - If the port is already in use, reject with EADDRINUSE.
   * - If a request arrives without a matching route, return 404.
   * - If header parsing fails (malformed request), return 400 Bad Request.
   */
  public start(port: number, host: string = '127.0.0.1'): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.server = net.createServer((socket) => {
          this.activeSockets.add(socket);

          socket.on('close', () => {
            this.activeSockets.delete(socket);
          });

          socket.on('error', (err) => {
            // Catch error to prevent process crash
            socket.destroy();
          });

          let buffer = '';

          socket.on('data', (chunk) => {
            buffer += chunk.toString();

            while (true) {
              const boundaryIdx = buffer.indexOf('\r\n\r\n');
              if (boundaryIdx === -1) {
                break; // Wait for headers
              }

              // Parse headers block to find Content-Length
              const headersBlock = buffer.substring(0, boundaryIdx);
              const lines = headersBlock.split('\r\n');
              const tempHeaders: Record<string, string> = {};
              for (let i = 1; i < lines.length; i++) {
                const colonIdx = lines[i].indexOf(':');
                if (colonIdx === -1) continue;
                const key = lines[i].substring(0, colonIdx).trim().toLowerCase();
                const value = lines[i].substring(colonIdx + 1).trim();
                tempHeaders[key] = value;
              }

              const contentLength = parseInt(tempHeaders['content-length'] || '0', 10);
              const requiredLength = boundaryIdx + 4 + contentLength;

              if (buffer.length < requiredLength) {
                break; // Wait for body
              }

              const rawRequest = buffer.substring(0, requiredLength);
              buffer = buffer.substring(requiredLength);

              try {
                const req = HTTPServer.parseRequest(rawRequest);
                const handler = this.routes.get(req.path);
                
                let res: HTTPResponse;
                if (handler) {
                  res = handler(req);
                } else {
                  res = {
                    statusCode: 404,
                    statusText: 'Not Found',
                    headers: { 'Content-Length': '0' },
                    body: ''
                  };
                }

                const rawResponse = HTTPServer.formatResponse(res);
                socket.write(rawResponse, (err) => {
                  if (err) {
                    socket.destroy();
                  } else if (req.headers['connection'] === 'close') {
                    socket.destroy();
                  }
                });
              } catch (e) {
                const badRes = HTTPServer.formatResponse({
                  statusCode: 400,
                  statusText: 'Bad Request',
                  headers: { 'Content-Length': '0' },
                  body: ''
                });
                socket.write(badRes, () => {
                  socket.destroy();
                });
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
   * Gracefully shuts down the HTTP server.
   *
   * WHAT IT SHOULD DO:
   * 1. Call `server.close()` to stop accepting new connections.
   * 2. All in-flight requests should be allowed to complete (or forcefully destroy
   *    sockets if a timeout elapses — production servers use this pattern).
   *
   * EDGE CASES:
   * - Safe to call even if no connections are active.
   * - If `start()` was never called (server is null), resolve immediately.
   */
  public stop(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.server) {
        resolve();
        return;
      }
      this.server.close(() => {
        resolve();
      });
      for (const socket of this.activeSockets) {
        socket.destroy();
      }
      this.activeSockets.clear();
      this.server = null;
    });
  }

  /**
   * Registers a route handler for a specific path.
   *
   * @param path - The URL path to match (e.g. `/api/users`). Exact match only.
   * @param handler - A function that receives an `HTTPRequest` and returns an `HTTPResponse`.
   *
   * NOTE: In this implementation, route matching is exact (no wildcards or params).
   * Production routers like Express use regex-based trie matching for `:param` segments.
   */
  public registerRoute(path: string, handler: (req: HTTPRequest) => HTTPResponse) {
    this.routes.set(path, handler);
  }

  /**
   * Parses a raw HTTP/1.1 request string into a structured `HTTPRequest` object.
   *
   * WHAT IT SHOULD DO:
   * 1. Find the index of `'\r\n\r\n'` to locate the header/body boundary.
   *    - If not found, throw (malformed request — no header terminator).
   * 2. Split the header block (everything before `'\r\n\r\n'`) into lines using `'\r\n'`.
   * 3. Parse `lines[0]` (the Request Line) by splitting on `' '`:
   *    - `parts[0]` = method (UPPERCASE string)
   *    - `parts[1]` = requestUri (may include `?query=string`)
   *    - `parts[2]` = HTTP version (e.g. `"HTTP/1.1"`)
   * 4. Extract `path` and `query` from `requestUri`:
   *    - Split on `'?'` → `path = parts[0]`, `queryString = parts[1] || ''`
   *    - Parse query string: split on `'&'`, then each pair on `'='`
   * 5. Parse header lines `[1..N]`:
   *    - Find the first `':'` in each line.
   *    - Key = substring before `':'`, lowercased, trimmed.
   *    - Value = substring after `':'`, trimmed.
   * 6. Parse body: take the body raw string, slice to `parseInt(headers['content-length'] || '0')` bytes.
   *
   * @param rawRequest - The full raw HTTP/1.1 request string (headers + optional body).
   * @returns A parsed `HTTPRequest` object.
   *
   * EDGE CASES:
   * - No `Content-Length` header → body should be `''` (empty string).
   * - Request-URI with no query string → `query` should be `{}`.
   * - Headers with no value (e.g. `"X-Custom:\r\n"`) → value should be `''`.
   * - Multiple values for the same header key → last one wins (simple implementation).
   */
  public static parseRequest(rawRequest: string): HTTPRequest {
    const boundaryIdx = rawRequest.indexOf('\r\n\r\n');
    if (boundaryIdx === -1) {
      throw new Error('Malformed request: no header/body boundary found.');
    }

    const headersBlock = rawRequest.substring(0, boundaryIdx);
    const bodyRaw = rawRequest.substring(boundaryIdx + 4);

    const lines = headersBlock.split('\r\n');
    if (lines.length === 0 || !lines[0]) {
      throw new Error('Malformed request: empty request line.');
    }

    const startLineParts = lines[0].split(' ');
    if (startLineParts.length < 3) {
      throw new Error('Malformed request: request line must contain method, URI, and version.');
    }

    const method = startLineParts[0].toUpperCase();
    const requestUri = startLineParts[1];
    const version = startLineParts[2];

    let path = requestUri;
    let queryString = '';
    const qIdx = requestUri.indexOf('?');
    if (qIdx !== -1) {
      path = requestUri.substring(0, qIdx);
      queryString = requestUri.substring(qIdx + 1);
    }

    const query: Record<string, string> = {};
    if (queryString) {
      const pairs = queryString.split('&');
      for (const pair of pairs) {
        if (!pair) continue;
        const eqIdx = pair.indexOf('=');
        if (eqIdx === -1) {
          const key = decodeURIComponent(pair.replace(/\+/g, ' '));
          query[key] = '';
        } else {
          const key = decodeURIComponent(pair.substring(0, eqIdx).replace(/\+/g, ' '));
          const val = decodeURIComponent(pair.substring(eqIdx + 1).replace(/\+/g, ' '));
          query[key] = val;
        }
      }
    }

    const headers: Record<string, string> = {};
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;
      const colonIdx = line.indexOf(':');
      if (colonIdx === -1) continue;
      const key = line.substring(0, colonIdx).trim().toLowerCase();
      const val = line.substring(colonIdx + 1).trim();
      headers[key] = val;
    }

    const contentLength = parseInt(headers['content-length'] || '0', 10);
    const body = bodyRaw.substring(0, contentLength);

    return {
      method,
      path,
      query,
      headers,
      body,
    };
  }

  /**
   * Formats an `HTTPResponse` object into a standards-compliant HTTP/1.1 response string.
   *
   * WHAT IT SHOULD DO:
   * 1. Construct the Status Line: `"HTTP/1.1 ${statusCode} ${statusText}\r\n"`
   * 2. Append each header entry: `"${key}: ${value}\r\n"` for every entry in `headers`.
   * 3. Append an empty line to terminate the headers section: `"\r\n"`.
   * 4. Append the `body` string.
   *
   * @param res - The structured `HTTPResponse` to serialize.
   * @returns A string of raw HTTP/1.1 response bytes ready to write to a socket.
   *
   * EDGE CASES:
   * - If `body` is empty (e.g. for 204 No Content), the trailing `\r\n` before body
   *   still MUST be present — it terminates the headers block.
   * - Headers with empty values should still be serialized: `"X-Custom: \r\n"`.
   *
   * EXAMPLE OUTPUT:
   * ```
   * HTTP/1.1 200 OK\r\n
   * Content-Type: application/json\r\n
   * Content-Length: 2\r\n
   * \r\n
   * {}
   * ```
   */
  public static formatResponse(res: HTTPResponse): string {
    const statusLine = `HTTP/1.1 ${res.statusCode} ${res.statusText}\r\n`;
    let headersStr = '';
    for (const [key, val] of Object.entries(res.headers)) {
      headersStr += `${key}: ${val}\r\n`;
    }
    return `${statusLine}${headersStr}\r\n${res.body}`;
  }
}
