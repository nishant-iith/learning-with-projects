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
    
    // Test sequential distribution
    expect(lb.getNextServer().url).toBe('http://server1:8080');
    expect(lb.getNextServer().url).toBe('http://server2:8080');
    expect(lb.getNextServer().url).toBe('http://server3:8080');
    expect(lb.getNextServer().url).toBe('http://server1:8080');
  });

  it('should route using Weighted Round Robin strategy with smooth interleaving', () => {
    const lb = new LoadBalancer(createBackends(), 'WEIGHTED_ROUND_ROBIN');
    
    // For weights: server1 (3), server2 (1), server3 (1)
    // The expected sequence using the Nginx smooth WRR algorithm is:
    // server1, server2, server1, server3, server1, then repeat.
    const sequence = [
      lb.getNextServer().url,
      lb.getNextServer().url,
      lb.getNextServer().url,
      lb.getNextServer().url,
      lb.getNextServer().url,
      lb.getNextServer().url
    ];

    expect(sequence).toEqual([
      'http://server1:8080',
      'http://server2:8080',
      'http://server1:8080',
      'http://server3:8080',
      'http://server1:8080',
      'http://server1:8080' // Repeat start
    ]);
  });

  it('should route using IP Hash strategy consistently based on client IP', () => {
    const lb = new LoadBalancer(createBackends(), 'IP_HASH');
    
    const first = lb.getNextServer('192.168.1.1');
    const second = lb.getNextServer('192.168.1.1');
    const third = lb.getNextServer('10.0.0.5');

    // Consistent routing for same client IP
    expect(first.url).toBe(second.url);
    
    // Ensure all requests are routed successfully
    expect(first.healthy).toBe(true);
    expect(third.healthy).toBe(true);
  });

  it('should handle health checks and bypass unhealthy backends', async () => {
    const backends = createBackends();
    const lb = new LoadBalancer(backends, 'ROUND_ROBIN');

    // Perform a mock health check where server2 becomes unhealthy
    await lb.performHealthCheck(async (url) => {
      if (url === 'http://server2:8080') return false;
      return true;
    });

    // Check that backend status updated correctly
    expect(backends[1].healthy).toBe(false);

    // ROUND_ROBIN routing should skip server2
    expect(lb.getNextServer().url).toBe('http://server1:8080');
    expect(lb.getNextServer().url).toBe('http://server3:8080'); // Server 2 is skipped
    expect(lb.getNextServer().url).toBe('http://server1:8080');
  });

  it('should throw an error when all backend servers are unhealthy', async () => {
    const backends = createBackends();
    const lb = new LoadBalancer(backends, 'ROUND_ROBIN');

    // Make all backends unhealthy
    await lb.performHealthCheck(async () => false);

    expect(() => lb.getNextServer()).toThrow('No healthy backends available');
  });
});

