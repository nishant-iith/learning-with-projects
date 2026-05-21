import { describe, it, expect } from 'vitest';
import { HTTPServer, HTTPRequest, HTTPResponse } from './index.js';

describe('HTTP Server Lab 01: Raw HTTP/1.1 Parser & Server', () => {
  
  describe('HTTP Parser Static Utilities', () => {
    it('should parse a raw GET request line and headers cleanly', () => {
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
  });
});
