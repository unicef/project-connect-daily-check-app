import { Injectable } from '@angular/core';

interface HardwareData {
  hardwareId: string;
  uuid: string;
  serial: string;
  sku: string;
  manufacturer: string;
  model: string;
  osSerial: string;
  timestamp: string;
}

interface HardwareError {
  error: string;
  message: string;
  timestamp: string;
}

@Injectable({
  providedIn: 'root',
})
export class HardwareIdService {
  private readonly STORAGE_KEY = 'system_hardware_id';
  /**
   * Returned by the main process when the system probe answered but had no
   * UUID or serial to give. It is stored like a real ID but matches no
   * registration, so treat it as "not available yet".
   */
  private readonly UNUSABLE_HARDWARE_ID = 'NO_UUID_AVAILABLE';
  private hardwareIdPromise: Promise<HardwareData | null> | null = null;
  private hardwareIdResolve: ((data: HardwareData | null) => void) | null =
    null;
  private hardwareIdReject: ((error: any) => void) | null = null;

  constructor() {
    this.initializeHardwareId();
  }

  /**
   * Initialize hardware ID listener when running in Electron
   */
  private initializeHardwareId(): void {
    if (this.isElectron()) {
      console.log('🔧 [HardwareID] Initializing hardware ID service...');

      // Listen for hardware ID success from main process
      this.getElectronAPI()?.onHardwareId((data: HardwareData) => {
        console.log(
          '✅ [HardwareID] Received hardware ID from Electron:',
          data.hardwareId
        );
        this.saveHardwareData(data);

        // Resolve any pending promises
        if (this.hardwareIdResolve) {
          this.hardwareIdResolve(data);
          this.hardwareIdResolve = null;
          this.hardwareIdReject = null;
        }
      });

      // Listen for hardware ID errors from main process
      this.getElectronAPI()?.onHardwareIdError((error: HardwareError) => {
        console.error(
          '❌ [HardwareID] Hardware ID error from Electron:',
          error
        );

        // Reject any pending promises
        if (this.hardwareIdReject) {
          this.hardwareIdReject(error);
          this.hardwareIdResolve = null;
          this.hardwareIdReject = null;
        }
      });

      // Also try to fetch it immediately via IPC
      this.fetchHardwareId();
    } else {
      console.warn(
        '⚠️ [HardwareID] Not running in Electron, hardware ID not available'
      );
    }
  }

  /**
   * Fetch hardware ID from Electron main process via IPC
   */
  async fetchHardwareId(): Promise<HardwareData | null> {
    if (!this.isElectron()) {
      console.warn(
        '⚠️ [HardwareID] Not running in Electron, hardware ID not available'
      );
      return null;
    }

    try {
      console.log('📤 [HardwareID] Requesting hardware ID via IPC...');
      const data = await this.getElectronAPI()?.getHardwareId();

      if (data && data.error) {
        console.error(
          '❌ [HardwareID] IPC returned error:',
          data.error,
          data.message
        );
        return null;
      }

      if (data && data.hardwareId) {
        console.log(
          '✅ [HardwareID] Fetched hardware ID via IPC:',
          data.hardwareId
        );
        this.saveHardwareData(data);
        return data;
      }

      console.warn('⚠️ [HardwareID] IPC returned empty data');
      return null;
    } catch (error) {
      console.error(
        '❌ [HardwareID] Error fetching hardware ID via IPC:',
        error
      );
      return null;
    }
  }

  /**
   * Save hardware data to localStorage
   */
  private saveHardwareData(data: HardwareData): void {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
      console.log('💾 Hardware ID saved to localStorage');
    } catch (error) {
      console.error('Error saving hardware ID to localStorage:', error);
    }
  }

  /**
   * Get hardware data from localStorage
   */
  getHardwareData(): HardwareData | null {
    try {
      const data = localStorage.getItem(this.STORAGE_KEY);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('Error reading hardware ID from localStorage:', error);
      return null;
    }
  }

  /**
   * Get just the hardware ID string
   */
  getHardwareId(): string | null {
    const data = this.getHardwareData();
    return data?.hardwareId || null;
  }

  /**
   * Check if running in Electron
   */
  private isElectron(): boolean {
    return !!(window && (window as any).electronAPI);
  }

  /**
   * Get the Electron API from window
   */
  private getElectronAPI(): any {
    return (window as any).electronAPI;
  }

  /**
   * Wait for hardware ID to be available with timeout (polling localStorage)
   * The constructor's event listeners handle saving to localStorage,
   * this method just waits for the data to appear there.
   *
   * @param timeoutMs Maximum time to wait in milliseconds (default: 10000ms)
   * @returns Promise that resolves to hardware ID or null
   */
  async ensureHardwareId(timeoutMs: number = 10000): Promise<string | null> {
    const startTime = Date.now();

    // Check immediately first (most common case - already available)
    const existingId = this.getHardwareId();
    if (existingId) {
      console.log(
        '✅ [HardwareID] Hardware ID already available from storage:',
        existingId
      );
      return existingId;
    }

    if (!this.isElectron()) {
      console.warn(
        '⚠️ [HardwareID] Not in Electron environment, cannot retrieve hardware ID'
      );
      return null;
    }

    console.log(
      `⏳ [HardwareID] Waiting for hardware ID (timeout: ${timeoutMs}ms)...`
    );

    // Poll localStorage for hardware ID (saved by constructor's event listeners)
    return new Promise((resolve) => {
      let isResolved = false;

      // Polling function with error handling
      const checkForHardwareId = () => {
        try {
          const id = this.getHardwareId();
          if (id && !isResolved) {
            isResolved = true;
            clearInterval(pollInterval);
            clearTimeout(timeoutHandle);
            const elapsed = Date.now() - startTime;
            console.log(
              `✅ [HardwareID] Hardware ID found after ${elapsed}ms:`,
              id
            );
            resolve(id);
          }
        } catch (error) {
          console.error(
            '❌ [HardwareID] Error reading from localStorage:',
            error
          );
          // Continue polling, might be a temporary issue
        }
      };

      // Poll every 50ms (finds data quickly without excessive CPU usage)
      const pollInterval = setInterval(checkForHardwareId, 50);

      // Set up timeout
      const timeoutHandle = setTimeout(() => {
        if (!isResolved) {
          isResolved = true;
          clearInterval(pollInterval);
          const elapsed = Date.now() - startTime;
          console.error(`❌ [HardwareID] Timeout after ${elapsed}ms`);
          console.error('   Possible causes:');
          console.error(
            '   1. Electron main process failed to retrieve system info'
          );
          console.error('   2. IPC communication is broken');
          console.error('   3. Hardware ID not saved to localStorage');
          console.error('   4. Event listeners not triggering properly');
          resolve(null);
        }
      }, timeoutMs);

      // Try to fetch via IPC as a backup (don't await, let it happen async)
      // The constructor's listeners will save it to localStorage if successful
      this.fetchHardwareId().catch((err) => {
        console.warn('⚠️ [HardwareID] Background IPC fetch failed:', err);
        // Don't resolve on error, let timeout handle it
      });
    });
  }

  /**
   * Whether an ID is real, rather than the main process's placeholder
   */
  isUsableHardwareId(hardwareId: string | null | undefined): boolean {
    return !!hardwareId && hardwareId !== this.UNUSABLE_HARDWARE_ID;
  }

  /**
   * Keep asking the main process until a usable hardware ID turns up.
   *
   * ensureHardwareId() polls localStorage only, so when the first IPC probe
   * comes back empty - common when Windows starts the app from the logon Run
   * key, before WMI is answering - nothing refreshes it for the rest of the
   * session. This re-invokes the IPC on an interval, and also picks the value
   * up from localStorage if the main process pushes it first.
   *
   * @param timeoutMs How long to keep trying (default: 180000ms)
   * @param intervalMs Gap between attempts (default: 10000ms)
   * @returns Promise that resolves to a usable hardware ID or null
   */
  async waitForUsableHardwareId(
    timeoutMs: number = 180000,
    intervalMs: number = 10000
  ): Promise<string | null> {
    const existingId = this.getHardwareId();
    if (this.isUsableHardwareId(existingId)) {
      return existingId;
    }

    if (!this.isElectron()) {
      return null;
    }

    console.log(
      `⏳ [HardwareID] Retrying in the background for up to ${timeoutMs}ms...`
    );

    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, intervalMs));

      // The constructor's listeners save any push from the main process here.
      const storedId = this.getHardwareId();
      if (this.isUsableHardwareId(storedId)) {
        console.log('✅ [HardwareID] Hardware ID arrived from main process:', storedId);
        return storedId;
      }

      const data = await this.fetchHardwareId();
      if (data && this.isUsableHardwareId(data.hardwareId)) {
        console.log('✅ [HardwareID] Hardware ID resolved on retry:', data.hardwareId);
        return data.hardwareId;
      }
    }

    console.warn(
      '⚠️ [HardwareID] No usable hardware ID after background retries'
    );
    return null;
  }

  /**
   * Clear hardware data from localStorage
   */
  clearHardwareData(): void {
    localStorage.removeItem(this.STORAGE_KEY);
    console.log('🗑️ Hardware ID cleared from localStorage');
  }
}
