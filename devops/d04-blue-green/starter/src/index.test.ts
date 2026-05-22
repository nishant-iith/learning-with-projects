import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  BlueGreenDeployer,
  INginxRouter,
  IAppServerLauncher,
  EnvironmentSlot,
  SystemStatus
} from './index.js';

describe('Blue-Green & Canary Deployer Tests', () => {
  let mockRouter: INginxRouter;
  let mockLauncher: IAppServerLauncher;
  let activeSlot: EnvironmentSlot;
  let runningServers: Map<EnvironmentSlot, { version: string; port: number; alive: boolean }>;

  beforeEach(() => {
    activeSlot = 'blue';
    runningServers = new Map();
    runningServers.set('blue', { version: 'v1.0.0', port: 3001, alive: true });

    // Mock Nginx Router implementation
    mockRouter = {
      getActiveSlot: vi.fn(async () => activeSlot),
      setActiveSlot: vi.fn(async (slot: EnvironmentSlot) => {
        activeSlot = slot;
      }),
      reload: vi.fn(async () => true),
      getRoutingConfig: vi.fn(async () => `upstream backend { server 127.0.0.1:${activeSlot === 'blue' ? 3001 : 3002}; }`)
    };

    // Mock App Server Launcher implementation
    mockLauncher = {
      start: vi.fn(async (slot: EnvironmentSlot, version: string) => {
        const port = slot === 'blue' ? 3001 : 3002;
        runningServers.set(slot, { version, port, alive: true });
        return port;
      }),
      stop: vi.fn(async (slot: EnvironmentSlot) => {
        const server = runningServers.get(slot);
        if (server) {
          server.alive = false;
        }
      }),
      isAlive: vi.fn(async (port: number) => {
        const slot = port === 3001 ? 'blue' : 'green';
        const server = runningServers.get(slot);
        return server ? server.alive : false;
      })
    };
  });

  it('should correctly identify active and inactive slots when active is blue', async () => {
    const deployer = new BlueGreenDeployer(mockRouter, mockLauncher);
    const status = await deployer.getSlotsStatus();

    expect(status.active.slot).toBe('blue');
    expect(status.active.port).toBe(3001);
    expect(status.inactive.slot).toBe('green');
    expect(status.inactive.port).toBe(3002);
  });

  it('should correctly identify active and inactive slots when active is green', async () => {
    activeSlot = 'green';
    runningServers.delete('blue');
    runningServers.set('green', { version: 'v1.0.0', port: 3002, alive: true });

    const deployer = new BlueGreenDeployer(mockRouter, mockLauncher);
    const status = await deployer.getSlotsStatus();

    expect(status.active.slot).toBe('green');
    expect(status.active.port).toBe(3002);
    expect(status.inactive.slot).toBe('blue');
    expect(status.inactive.port).toBe(3001);
  });

  it('should perform a successful blue-green deployment', async () => {
    const deployer = new BlueGreenDeployer(mockRouter, mockLauncher, {
      smokeTestRetries: 2,
      smokeTestIntervalMs: 1
    });

    const result = await deployer.deploy('v2.0.0');

    expect(result.success).toBe(true);
    expect(result.activeSlot).toBe('green');
    expect(activeSlot).toBe('green');

    // Verify launcher was called to start green slot
    expect(mockLauncher.start).toHaveBeenCalledWith('green', 'v2.0.0');
    // Verify router changed the active slot
    expect(mockRouter.setActiveSlot).toHaveBeenCalledWith('green');
    // Verify router executed a hot-reload
    expect(mockRouter.reload).toHaveBeenCalled();
  });

  it('should retry smoke tests and succeed if the server becomes alive within retry limits', async () => {
    let callCount = 0;
    mockLauncher.isAlive = vi.fn(async (port: number) => {
      callCount++;
      // Fail the first 2 probes, succeed on the 3rd
      return callCount >= 3;
    });

    const deployer = new BlueGreenDeployer(mockRouter, mockLauncher, {
      smokeTestRetries: 3,
      smokeTestIntervalMs: 1
    });

    const result = await deployer.deploy('v2.0.0');

    expect(result.success).toBe(true);
    expect(result.activeSlot).toBe('green');
    expect(activeSlot).toBe('green');
    expect(callCount).toBe(3);
  });

  it('should protect against deployment failures and rollback if smoke test fails completely', async () => {
    // Force health checks to always return false (offline)
    mockLauncher.isAlive = vi.fn(async () => false);

    const deployer = new BlueGreenDeployer(mockRouter, mockLauncher, {
      smokeTestRetries: 3,
      smokeTestIntervalMs: 1
    });

    // Deployment must fail/throw
    await expect(deployer.deploy('v2.0.0')).rejects.toThrow(/Smoke test failed/);

    // Verify routing was NOT changed and remains 'blue'
    expect(activeSlot).toBe('blue');
    expect(mockRouter.setActiveSlot).not.toHaveBeenCalledWith('green');
    expect(mockRouter.reload).not.toHaveBeenCalled();

    // Verify the inactive (green) slot was stopped (cleanup/rollback)
    expect(mockLauncher.stop).toHaveBeenCalledWith('green');
  });

  it('should abort deployment and rollback if Nginx reload fails', async () => {
    // Force Nginx reload to fail (return false)
    mockRouter.reload = vi.fn(async () => false);

    const deployer = new BlueGreenDeployer(mockRouter, mockLauncher, {
      smokeTestRetries: 1,
      smokeTestIntervalMs: 1
    });

    await expect(deployer.deploy('v2.0.0')).rejects.toThrow(/Nginx hot-reload failed/);

    // Verify launcher was stopped for green slot (cleanup)
    expect(mockLauncher.stop).toHaveBeenCalledWith('green');
  });

  it('should use default retry and interval settings when options are omitted', async () => {
    // We omit option object to test default options: smokeTestRetries default = 3
    let callCount = 0;
    mockLauncher.isAlive = vi.fn(async () => {
      callCount++;
      return false; // Force fail all retries
    });

    const deployer = new BlueGreenDeployer(mockRouter, mockLauncher);

    await expect(deployer.deploy('v2.0.0')).rejects.toThrow(/Smoke test failed/);

    // Verify it called isAlive with inactivePort (3002) exactly 3 times (the default retries)
    const inactiveCalls = (mockLauncher.isAlive as any).mock.calls.filter((call: any) => call[0] === 3002);
    expect(inactiveCalls.length).toBe(3);
  });
});


