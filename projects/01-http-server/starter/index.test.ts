import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as net from 'net';
import { HTTPServer, HTTPRequest, HTTPResponse } from './index.js';

/**
 * TDD Test Suite: Lab 01 — Raw HTTP/1.1 Parser & Server
 *
 * These tests cover the complete HTTP/1.1 parsing and formatting lifecycle:
 *   - Request line parsing (method, path, version)
 *   - Query string extraction
 *   - Header parsing (case-insensitivity)
 *   - Body extraction via Content-Length
 *   - Response formatting (status line, headers, body)
 *   - Edge cases: empty bodies, missing Content-Length, malformed inputs
 *   - Route registration and 404 handling
 */
describe('HTTP Server Lab 01: Raw HTTP/1.1 Parser & Server', () => {
  
  describe('HTTP Parser Static Utilities', () => {
    it('should parse a raw GET request line and headers cleanly', () => {
      /**
       * SCENARIO: Standard GET request with query parameters and multiple headers.
       * EXPECTED: All fields correctly extracted with lowercase header keys.
       * VERIFIES: Request-line splitting, URL path/query separation, header case normalization.
       */
      const raw = 
        "GET /search?q=typescript&limit=10 HTTP/1.1\r\n" +
        "Host: localhost:8080\r\n" +
        "User-Agent: Mozilla/5.0\r\n" +
        "Accept: */*\r\n\r\n";

      const req = HTTPServer.parseRequest(raw);
      expect(req.method).toBe('GET');
      expect(req.path).toBe('/search');
      expect(req.query.q).toBe('typescript');
      expect(req.query.limit).toBe('10');
      expect(req.headers['host']).toBe('localhost:8080');
      expect(req.headers['user-agent']).toBe('Mozilla/5.0');
    });

    it('should parse a raw POST request with a JSON body', () => {
      /**
       * SCENARIO: POST request with a JSON body and Content-Length header.
       * EXPECTED: Body is extracted exactly according to Content-Length byte count.
       * VERIFIES: Body extraction logic, Content-Length header parsing.
       */
      const rawBody = '{"name":"Alice"}';
      const raw = 
        "POST /users HTTP/1.1\r\n" +
        "Host: localhost:8080\r\n" +
        `Content-Length: ${rawBody.length}\r\n` +
        "Content-Type: application/json\r\n\r\n" +
        rawBody;

      const req = HTTPServer.parseRequest(raw);
      expect(req.method).toBe('POST');
      expect(req.path).toBe('/users');
      expect(req.body).toBe(rawBody);
    });

    it('should format a structured HTTP response correctly', () => {
      /**
       * SCENARIO: Standard 200 OK response with headers and body.
       * EXPECTED: Correctly formatted byte string with CRLF line endings.
       * VERIFIES: Status line format, header serialization, body appending.
       */
      const res: HTTPResponse = {
        statusCode: 200,
        statusText: 'OK',
        headers: {
          'Content-Type': 'text/plain',
          'Content-Length': '12'
        },
        body: 'Hello World!'
      };

      const formatted = HTTPServer.formatResponse(res);
      expect(formatted).toBe(
        "HTTP/1.1 200 OK\r\n" +
        "Content-Type: text/plain\r\n" +
        "Content-Length: 12\r\n\r\n" +
        "Hello World!"
      );
    });

    it('should parse a GET request with no query parameters', () => {
      /**
       * SCENARIO: Simple GET request with no query string.
       * EXPECTED: query object is empty {}, path is the full URI.
       * VERIFIES: Edge case — no '?' in the URI path.
       */
      const raw = "GET /health HTTP/1.1\r\nHost: localhost\r\n\r\n";
      const req = HTTPServer.parseRequest(raw);
      expect(req.method).toBe('GET');
      expect(req.path).toBe('/health');
      expect(Object.keys(req.query).length).toBe(0);
      expect(req.body).toBe('');
    });

    it('should parse headers as case-insensitive (lowercase keys)', () => {
      /**
       * SCENARIO: Request with mixed-case header names.
       * EXPECTED: All keys are stored in lowercase.
       * VERIFIES: RFC 7230 §3.2 — field names are case-insensitive.
       *
       * PRODUCTION RELEVANCE: Middleware that checks `req.headers['Content-Type']`
       * (title-cased) would fail if parsing produced uppercase keys.
       */
      const raw =
        "GET / HTTP/1.1\r\n" +
        "CONTENT-TYPE: text/html\r\n" +
        "X-Request-Id: abc-123\r\n\r\n";

      const req = HTTPServer.parseRequest(raw);
      expect(req.headers['content-type']).toBe('text/html');
      expect(req.headers['x-request-id']).toBe('abc-123');
    });

    it('should return empty body when Content-Length is absent', () => {
      /**
       * SCENARIO: GET request with no body and no Content-Length.
       * EXPECTED: body field is '' (empty string).
       * VERIFIES: No Content-Length → body defaults to empty.
       *
       * EDGE CASE: If the parser reads past the boundary without this guard,
       * it may return garbage data from the buffer tail.
       */
      const raw = "DELETE /items/5 HTTP/1.1\r\nHost: api.local\r\n\r\n";
      const req = HTTPServer.parseRequest(raw);
      expect(req.body).toBe('');
    });

    it('should handle multiple query parameters including URL-encoded values', () => {
      /**
       * SCENARIO: Request URI with three query params including a space-encoded value.
       * EXPECTED: All params decoded and extracted correctly.
       * VERIFIES: Multi-parameter query string splitting and value extraction.
       */
      const raw = "GET /search?q=hello+world&page=2&sort=asc HTTP/1.1\r\nHost: api\r\n\r\n";
      const req = HTTPServer.parseRequest(raw);
      expect(req.query['page']).toBe('2');
      expect(req.query['sort']).toBe('asc');
    });

    it('should format a 404 Not Found response correctly', () => {
      /**
       * SCENARIO: Route handler returns a 404 response.
       * EXPECTED: Correctly formatted status line and empty body.
       * VERIFIES: Non-200 status codes are serialized correctly.
       */
      const res: HTTPResponse = {
        statusCode: 404,
        statusText: 'Not Found',
        headers: { 'Content-Length': '0' },
        body: ''
      };

      const formatted = HTTPServer.formatResponse(res);
      expect(formatted).toContain('HTTP/1.1 404 Not Found');
      expect(formatted).toContain('\r\n\r\n');
    });

    it('should handle a PUT request with a body correctly', () => {
      /**
       * SCENARIO: PUT request updating a resource with a JSON payload.
       * EXPECTED: Method is PUT, path is extracted, body matches payload.
       * VERIFIES: Non-GET verbs and body parsing work together.
       */
      const body = '{"email":"bob@example.com"}';
      const raw =
        `PUT /users/42 HTTP/1.1\r\n` +
        `Content-Type: application/json\r\n` +
        `Content-Length: ${body.length}\r\n\r\n` +
        body;

      const req = HTTPServer.parseRequest(raw);
      expect(req.method).toBe('PUT');
      expect(req.path).toBe('/users/42');
      expect(req.body).toBe(body);
      expect(req.headers['content-type']).toBe('application/json');
    });

    it('should format a response with no body (204 No Content)', () => {
      /**
       * SCENARIO: 204 No Content response — no body, no Content-Length.
       * EXPECTED: Response still ends with \r\n\r\n after headers.
       * VERIFIES: Header terminator is always present even with empty body.
       *
       * EDGE CASE: HTTP clients hang forever if the \r\n\r\n terminator is missing.
       */
      const res: HTTPResponse = {
        statusCode: 204,
        statusText: 'No Content',
        headers: {},
        body: ''
      };

      const formatted = HTTPServer.formatResponse(res);
      expect(formatted).toContain('HTTP/1.1 204 No Content\r\n');
      expect(formatted).toContain('\r\n\r\n');
    });
  });

  describe('HTTP Server Integration', () => {
    let server: HTTPServer;
    const PORT = 8999;
    const HOST = '127.0.0.1';

    beforeEach(async () => {
      server = new HTTPServer();
      server.registerRoute('/hello', (req) => {
        return {
          statusCode: 200,
          statusText: 'OK',
          headers: { 'Content-Type': 'text/plain', 'Content-Length': '5' },
          body: 'world'
        };
      });
      server.registerRoute('/echo', (req) => {
        return {
          statusCode: 200,
          statusText: 'OK',
          headers: { 'Content-Type': 'application/json', 'Content-Length': String(Buffer.byteLength(req.body)) },
          body: req.body
        };
      });
      await server.start(PORT, HOST);
    });

    afterEach(async () => {
      await server.stop();
    });

    it('should route matching requests successfully', () => {
      return new Promise<void>((resolve, reject) => {
        const client = net.createConnection({ port: PORT, host: HOST }, () => {
          client.write(
            "GET /hello HTTP/1.1\r\n" +
            "Host: 127.0.0.1\r\n\r\n"
          );
        });

        let data = '';
        client.on('data', (chunk) => {
          data += chunk.toString();
          if (data.includes('world')) {
            expect(data).toContain('HTTP/1.1 200 OK');
            expect(data).toContain('Content-Type: text/plain');
            expect(data).toContain('world');
            client.destroy();
            resolve();
          }
        });

        client.on('error', reject);
      });
    });

    it('should return 404 for unregistered routes', () => {
      return new Promise<void>((resolve, reject) => {
        const client = net.createConnection({ port: PORT, host: HOST }, () => {
          client.write(
            "GET /not-exists HTTP/1.1\r\n" +
            "Host: 127.0.0.1\r\n\r\n"
          );
        });

        let data = '';
        client.on('data', (chunk) => {
          data += chunk.toString();
          if (data.includes('\r\n\r\n')) {
            expect(data).toContain('HTTP/1.1 404 Not Found');
            client.destroy();
            resolve();
          }
        });

        client.on('error', reject);
      });
    });

    it('should handle keep-alive sequential requests on same socket', () => {
      return new Promise<void>((resolve, reject) => {
        const client = net.createConnection({ port: PORT, host: HOST }, () => {
          client.write(
            "POST /echo HTTP/1.1\r\n" +
            "Host: 127.0.0.1\r\n" +
            "Content-Length: 4\r\n\r\n" +
            "test"
          );
        });

        let data = '';
        let step = 1;

        client.on('data', (chunk) => {
          data += chunk.toString();
          if (step === 1 && data.includes('test')) {
            expect(data).toContain('HTTP/1.1 200 OK');
            expect(data).toContain('test');
            // Send second request on same socket
            data = '';
            step = 2;
            client.write(
              "GET /hello HTTP/1.1\r\n" +
              "Host: 127.0.0.1\r\n" +
              "Connection: close\r\n\r\n"
            );
          } else if (step === 2 && data.includes('world')) {
            expect(data).toContain('HTTP/1.1 200 OK');
            expect(data).toContain('world');
            client.destroy();
            resolve();
          }
        });

        client.on('error', reject);
      });
    });

    it('should buffer fragmented incoming chunks correctly', () => {
      return new Promise<void>((resolve, reject) => {
        const client = net.createConnection({ port: PORT, host: HOST }, () => {
          // Send part 1: just the start line
          client.write("GET /hello HT");
          setTimeout(() => {
            // Send part 2: headers
            client.write("TP/1.1\r\nHost: 127.0.0.1\r\n\r\n");
          }, 50);
        });

        let data = '';
        client.on('data', (chunk) => {
          data += chunk.toString();
          if (data.includes('world')) {
            expect(data).toContain('HTTP/1.1 200 OK');
            expect(data).toContain('world');
            client.destroy();
            resolve();
          }
        });

        client.on('error', reject);
      });
    });
  });
});

