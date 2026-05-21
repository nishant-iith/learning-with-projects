export type EnvironmentSlot = 'blue' | 'green';

export interface INginxRouter {
  getActiveSlot(): Promise<EnvironmentSlot>;
  setActiveSlot(slot: EnvironmentSlot): Promise<void>;
  reload(): Promise<boolean>;
  getRoutingConfig(): Promise<string>;
}

export interface IAppServerLauncher {
  start(slot: EnvironmentSlot, version: string): Promise<number>; // returns port number
  stop(slot: EnvironmentSlot): Promise<void>;
  isAlive(port: number): Promise<boolean>;
}

export interface DeployerOptions {
  smokeTestRetries?: number;
  smokeTestIntervalMs?: number;
}

export interface SlotStatus {
  slot: EnvironmentSlot;
  version: string | null;
  port: number;
}

export interface SystemStatus {
  active: SlotStatus;
  inactive: SlotStatus;
}

export class BlueGreenDeployer {
  constructor(
    private router: INginxRouter,
    private launcher: IAppServerLauncher,
    private options: DeployerOptions = {}
  ) {}

  /**
   * Returns the current status of both active and inactive slots.
   */
  async getSlotsStatus(): Promise<SystemStatus> {
    // TDD Starter: Stub implementation that throws error to fail tests.
    throw new Error("getSlotsStatus is not implemented");
  }

  /**
   * Deploys a new version using a zero-downtime blue-green strategy:
   * 1. Detect active and inactive slots.
   * 2. Spin up the new version in the inactive slot.
   * 3. Smoke test the new version via probes.
   * 4. If probes pass, shift routing in Nginx and hot-reload.
   * 5. If probes fail, shut down the inactive slot and abort (rollback).
   */
  async deploy(newVersion: string): Promise<{ success: boolean; activeSlot: EnvironmentSlot }> {
    // TDD Starter: Stub implementation that throws error to fail tests.
    throw new Error("deploy is not implemented");
  }
}
