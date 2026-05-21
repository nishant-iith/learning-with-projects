import * as net from 'net';

export class TCPServer {
  private server: net.Server | null = null;
  private activeSockets: Set<net.Socket> = new Set();
  
  // Event listeners
  private onConnectionCallback: ((socket: net.Socket) => void) | null = null;
  private onDataCallback: ((socket: net.Socket, data: Buffer) => void) | null = null;
  private onCloseCallback: ((socket: net.Socket) => void) | null = null;

  constructor() {}

  public start(port: number, host: string = '127.0.0.1'): Promise<void> {
    return new Promise((resolve, reject) => {
      // TODO: Create a net.Server using net.createServer()
      // TODO: Configure tcpNoDelay = true on every socket to disable Nagle's algorithm
      // TODO: Manage activeSockets set on connection and close
      // TODO: Hook up the connection callback, data callback, and close callback
      // TODO: Bind the server to the port and host
      reject(new Error('TCPServer.start is not implemented'));
    });
  }

  public stop(): Promise<void> {
    return new Promise((resolve) => {
      // TODO: Close the server and destroy all active client sockets
      resolve();
    });
  }

  public onConnection(callback: (socket: net.Socket) => void) {
    this.onConnectionCallback = callback;
  }

  public onData(callback: (socket: net.Socket, data: Buffer) => void) {
    this.onDataCallback = callback;
  }

  public onClose(callback: (socket: net.Socket) => void) {
    this.onCloseCallback = callback;
  }

  public getActiveConnectionsCount(): number {
    return this.activeSockets.size;
  }
}

export class TCPClient {
  private socket: net.Socket | null = null;
  private onDataCallback: ((data: Buffer) => void) | null = null;
  private onDisconnectCallback: (() => void) | null = null;

  constructor() {}

  public connect(port: number, host: string = '127.0.0.1'): Promise<void> {
    return new Promise((resolve, reject) => {
      // TODO: Create a new net.Socket
      // TODO: Disable Nagle's algorithm (setNoDelay)
      // TODO: Register connect, data, close, and error event handlers
      // TODO: Connect the socket to the port and host
      reject(new Error('TCPClient.connect is not implemented'));
    });
  }

  public send(data: string | Buffer): Promise<void> {
    return new Promise((resolve, reject) => {
      // TODO: Write data to the socket.
      // TODO: Handle backpressure! If socket.write returns false, wait for the 'drain' event before resolving.
      reject(new Error('TCPClient.send is not implemented'));
    });
  }

  public disconnect(): Promise<void> {
    return new Promise((resolve) => {
      // TODO: End the socket connection gracefully
      resolve();
    });
  }

  public onData(callback: (data: Buffer) => void) {
    this.onDataCallback = callback;
  }

  public onDisconnect(callback: () => void) {
    this.onDisconnectCallback = callback;
  }
}
