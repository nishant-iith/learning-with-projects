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
  
  // Track weights dynamically for the Nginx smooth weighted round robin algorithm
  private currentWeights: Map<string, number> = new Map();

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
      const server = activeServers[this.rrIndex % activeServers.length];
      this.rrIndex++;
      return server;
    }

    if (this.strategy === 'WEIGHTED_ROUND_ROBIN') {
      let totalWeight = 0;
      let maxWeightServer: BackendServer | null = null;
      let maxWeightValue = -Infinity;

      for (const server of activeServers) {
        totalWeight += server.weight;
        let currentWeight = this.currentWeights.get(server.url) || 0;
        currentWeight += server.weight;
        this.currentWeights.set(server.url, currentWeight);

        if (currentWeight > maxWeightValue) {
          maxWeightValue = currentWeight;
          maxWeightServer = server;
        }
      }

      if (maxWeightServer) {
        let currentWeight = this.currentWeights.get(maxWeightServer.url) || 0;
        currentWeight -= totalWeight;
        this.currentWeights.set(maxWeightServer.url, currentWeight);
        return maxWeightServer;
      }

      return activeServers[0];
    }

    if (this.strategy === 'IP_HASH') {
      const ip = clientIp || '127.0.0.1';
      let hash = 0;
      for (let i = 0; i < ip.length; i++) {
        hash += ip.charCodeAt(i);
      }
      return activeServers[hash % activeServers.length];
    }

    throw new Error('Unknown routing strategy');
  }

  public async performHealthCheck(pingUrl: (url: string) => Promise<boolean>): Promise<void> {
    await Promise.all(
      this.backends.map(async (backend) => {
        try {
          backend.healthy = await pingUrl(backend.url);
        } catch {
          backend.healthy = false;
        }
      })
    );
  }

  public getBackends(): BackendServer[] {
    return this.backends;
  }
}

