import * as net from 'net';

export interface HTTPRequest {
  method: string;
  path: string;
  query: Record<string, string>;
  headers: Record<string, string>;
  body: string;
}

export interface HTTPResponse {
  statusCode: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
}

export class HTTPServer {
  private server: net.Server | null = null;
  private routes: Map<string, (req: HTTPRequest) => HTTPResponse> = new Map();

  constructor() {}

  public start(port: number, host: string = '127.0.0.1'): Promise<void> {
    return new Promise((resolve, reject) => {
      // TODO: Create a net.Server that listens for incoming TCP connections.
      // TODO: On connection, buffer data and parse incoming HTTP/1.1 requests.
      // TODO: Match parsed request paths to routes.
      // TODO: Format standard HTTP/1.1 response byte streams and write back to socket.
      // TODO: Support keep-alive persistent connections.
      reject(new Error('HTTPServer.start is not implemented'));
    });
  }

  public stop(): Promise<void> {
    return new Promise((resolve) => {
      // TODO: Gracefully shutdown the server
      resolve();
    });
  }

  public registerRoute(path: string, handler: (req: HTTPRequest) => HTTPResponse) {
    this.routes.set(path, handler);
  }

  public static parseRequest(rawRequest: string): HTTPRequest {
    // TODO: Parse double CRLF boundary to split header block and body
    // TODO: Parse the first line (Request Line) to extract Method, Request-URI, and HTTP Version
    // TODO: Parse query parameters from Request-URI
    // TODO: Parse remaining lines in the header block as case-insensitive key-value pairs (lowercase keys)
    // TODO: Read body according to Content-Length
    throw new Error('parseRequest is not implemented');
  }

  public static formatResponse(res: HTTPResponse): string {
    // TODO: Construct the Status Line (e.g. "HTTP/1.1 200 OK\r\n")
    // TODO: Construct the headers (e.g. "Content-Type: text/plain\r\n")
    // TODO: Append trailing \r\n and response body
    throw new Error('formatResponse is not implemented');
  }
}
