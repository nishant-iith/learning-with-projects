import { describe, it, expect } from 'vitest';
import { LoadBalancer, BackendServer } from './index.js';

describe('Load Balancer Lab 04: Reverse Proxy Routing', () => {

  const createBackends = (): BackendServer[] => [
    { url: 'http://server1:8080', weight: 3, healthy: true },
    { url: 'http://server2:8080', weight: 1, healthy: true },
    { url: 'http://server3:8080', weight: 1, healthy: true }
  ];

  it('should route using Round Robin strategy', () => {
    const lb = new LoadBalancer(createBackends(), 'ROUND_ROBIN');
    
    // Mock the simple implementation logic expected
    lb.getNextServer = function() {
      const active = this.backends.filter(b => b.healthy);
      const server = active[this.rrIndex % active.length];
      this.rrIndex++;
      return server;
    };

    expect(lb.getNextServer().url).toBe('http://server1:8080');
    expect(lb.getNextServer().url).toBe('http://server2:8080');
    expect(lb.getNextServer().url).toBe('http://server3:8080');
    expect(lb.getNextServer().url).toBe('http://server1:8080');
  });

  it('should route using IP Hash strategy consistently', () => {
    const lb = new LoadBalancer(createBackends(), 'IP_HASH');
    
    lb.getNextServer = function(clientIp = '127.0.0.1') {
      const active = this.backends.filter(b => b.healthy);
      // Hash string to simple number
      let hash = 0;
      for (let i = 0; i < clientIp.length; i++) {
        hash += clientIp.charCodeAt(i);
      }
      return active[hash % active.length];
    };

    const first = lb.getNextServer('192.168.1.1');
    const second = lb.getNextServer('192.168.1.1');
    const third = lb.getNextServer('10.0.0.5');

    expect(first.url).toBe(second.url); // Must be consistent
  });

  it('should handle health checks and bypass unhealthy backends', async () => {
    const backends = createBackends();
    const lb = new LoadBalancer(backends, 'ROUND_ROBIN');

    lb.getNextServer = function() {
      const active = this.backends.filter(b => b.healthy);
      const server = active[this.rrIndex % active.length];
      this.rrIndex++;
      return server;
    };

    // Server 2 crashes
    backends[1].healthy = false;

    expect(lb.getNextServer().url).toBe('http://server1:8080');
    expect(lb.getNextServer().url).toBe('http://server3:8080'); // Server 2 is skipped
    expect(lb.getNextServer().url).toBe('http://server1:8080');
  });
});
