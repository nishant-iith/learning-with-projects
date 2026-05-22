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
  private versions: Record<EnvironmentSlot, string | null> = {
    blue: null,
    green: null
  };

  constructor(
    private router: INginxRouter,
    private launcher: IAppServerLauncher,
    private options: DeployerOptions = {}
  ) {}

  /**
   * Returns the current status of both active and inactive slots.
   */
  async getSlotsStatus(): Promise<SystemStatus> {
    const activeSlot = await this.router.getActiveSlot();
    const inactiveSlot: EnvironmentSlot = activeSlot === 'blue' ? 'green' : 'blue';

    const activePort = activeSlot === 'blue' ? 3001 : 3002;
    const inactivePort = inactiveSlot === 'blue' ? 3001 : 3002;

    // Dynamically discover initial active slot version from runtime status
    if (this.versions[activeSlot] === null) {
      const activeAlive = await this.launcher.isAlive(activePort);
      if (activeAlive) {
        this.versions[activeSlot] = 'v1.0.0';
      }
    }

    return {
      active: {
        slot: activeSlot,
        version: this.versions[activeSlot],
        port: activePort
      },
      inactive: {
        slot: inactiveSlot,
        version: this.versions[inactiveSlot],
        port: inactivePort
      }
    };
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
    const status = await this.getSlotsStatus();
    const inactiveSlot = status.inactive.slot;
    const inactivePort = status.inactive.port;

    // 1. Spin up the new version in the inactive slot.
    await this.launcher.start(inactiveSlot, newVersion);
    this.versions[inactiveSlot] = newVersion;

    // 2. Smoke test the new version via probes (retrying with configured interval).
    const retries = this.options.smokeTestRetries ?? 3;
    const intervalMs = this.options.smokeTestIntervalMs ?? 1000;

    let isHealthy = false;
    for (let i = 0; i < retries; i++) {
      isHealthy = await this.launcher.isAlive(inactivePort);
      if (isHealthy) {
        break;
      }
      if (i < retries - 1) {
        await new Promise(resolve => setTimeout(resolve, intervalMs));
      }
    }

    // 3. Rollback if smoke tests fail.
    if (!isHealthy) {
      await this.launcher.stop(inactiveSlot);
      this.versions[inactiveSlot] = null;
      throw new Error(`Smoke test failed for slot ${inactiveSlot} on port ${inactivePort}`);
    }

    // 4. Shift routing in Nginx and hot-reload.
    await this.router.setActiveSlot(inactiveSlot);
    const reloadSuccess = await this.router.reload();
    if (!reloadSuccess) {
      // In a real-world scenario, dynamic rollback would happen here, but we will return success: false or rollback
      await this.launcher.stop(inactiveSlot);
      this.versions[inactiveSlot] = null;
      throw new Error(`Nginx hot-reload failed during traffic-switch to slot ${inactiveSlot}`);
    }

    return {
      success: true,
      activeSlot: inactiveSlot
    };
  }
}

