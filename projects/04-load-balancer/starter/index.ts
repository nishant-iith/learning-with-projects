export interface BackendServer {
  url: string;
  weight: number;
  healthy: boolean;
}

export type RoutingStrategy = 'ROUND_ROBIN' | 'WEIGHTED_ROUND_ROBIN' | 'IP_HASH';

export class LoadBalancer {
  private backends: BackendServer[] = [];
  private strategy: RoutingStrategy;
  private rrIndex: number = 0;
  
  // For Weighted Round Robin tracking
  private wrrIndex: number = 0;
  private currentWeight: number = 0;

  constructor(backends: BackendServer[], strategy: RoutingStrategy = 'ROUND_ROBIN') {
    this.backends = backends;
    this.strategy = strategy;
  }

  public getNextServer(clientIp?: string): BackendServer {
    const activeServers = this.backends.filter(b => b.healthy);
    if (activeServers.length === 0) {
      throw new Error('No healthy backends available');
    }

    if (this.strategy === 'ROUND_ROBIN') {
      // TODO: Implement Round Robin selection
      // TODO: Loop rrIndex over activeServers.length and increment it
      throw new Error('ROUND_ROBIN is not implemented');
    }

    if (this.strategy === 'WEIGHTED_ROUND_ROBIN') {
      // TODO: Implement Weighted Round Robin selection
      // TODO: Select server based on configured weights
      throw new Error('WEIGHTED_ROUND_ROBIN is not implemented');
    }

    if (this.strategy === 'IP_HASH') {
      // TODO: Implement IP Hash selection
      // TODO: Hash the clientIp and select server using modulo: hash % activeServers.length
      throw new Error('IP_HASH is not implemented');
    }

    throw new Error('Unknown routing strategy');
  }

  public async performHealthCheck(pingUrl: (url: string) => Promise<boolean>): Promise<void> {
    // TODO: Iterate over all backends (both healthy and unhealthy)
    // TODO: Invoke pingUrl for each backend
    // TODO: Update each backend's healthy status based on the result
  }

  public getBackends(): BackendServer[] {
    return this.backends;
  }
}
