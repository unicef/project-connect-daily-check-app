import { HardwareIdService } from './hardware-id.service';

describe('HardwareIdService.waitForUsableHardwareId', () => {
  const STORAGE_KEY = 'system_hardware_id';
  const PLACEHOLDER = { hardwareId: 'NO_UUID_AVAILABLE' };
  let getHardwareId: jasmine.Spy;
  let service: HardwareIdService;

  const flushMicrotasks = async () => {
    for (let i = 0; i < 25; i++) {
      await Promise.resolve();
    }
  };

  /** Advance the mocked clock in 1s steps, letting the awaits in between run. */
  const advance = async (ms: number) => {
    for (let t = 0; t < ms; t += 1000) {
      jasmine.clock().tick(Math.min(1000, ms - t));
      await flushMicrotasks();
    }
  };

  /** Times (ms since start) at which the IPC was re-invoked by the retry loop. */
  const callTimes: number[] = [];

  beforeEach(() => {
    localStorage.removeItem(STORAGE_KEY);
    jasmine.clock().install();
    jasmine.clock().mockDate(new Date(0));
    callTimes.length = 0;
    getHardwareId = jasmine.createSpy('getHardwareId').and.callFake(() => {
      callTimes.push(Date.now());
      return Promise.resolve(PLACEHOLDER);
    });
    (window as any).electronAPI = {
      getHardwareId,
      onHardwareId: () => undefined,
      onHardwareIdError: () => undefined,
    };
    service = new HardwareIdService();
    callTimes.length = 0; // ignore the constructor's own fetch
  });

  afterEach(() => {
    jasmine.clock().uninstall();
    delete (window as any).electronAPI;
    localStorage.removeItem(STORAGE_KEY);
  });

  it('treats the main-process placeholder as unusable', () => {
    expect(service.isUsableHardwareId('NO_UUID_AVAILABLE')).toBeFalse();
    expect(service.isUsableHardwareId(null)).toBeFalse();
    expect(service.isUsableHardwareId('ABC-123')).toBeTrue();
  });

  it('backs off exponentially from 2s', async () => {
    const result = service.waitForUsableHardwareId(() => true, 60 * 1000);
    await advance(31 * 1000);

    // 2s, then +4s, +8s, +16s
    expect(callTimes).toEqual([2000, 6000, 14000, 30000]);
    await advance(60 * 1000);
    expect(await result).toBeNull();
  });

  it('caps the gap between attempts', async () => {
    const result = service.waitForUsableHardwareId(
      () => true,
      40 * 1000,
      2000,
      5000
    );
    await advance(40 * 1000);

    // the last attempt lands on the deadline itself
    expect(callTimes).toEqual([
      2000, 6000, 11000, 16000, 21000, 26000, 31000, 36000, 40000,
    ]);
    expect(await result).toBeNull();
  });

  it('resolves as soon as the main process pushes an ID, without waiting out the delay', async () => {
    const result = service.waitForUsableHardwareId();
    await advance(14000); // attempts at 2s, 6s, 14s; next one due at 30s

    localStorage.setItem(STORAGE_KEY, JSON.stringify({ hardwareId: 'UUID-1' }));
    await advance(1000);

    expect(await result).toBe('UUID-1');
    expect(callTimes.length).toBe(3);
  });

  it('resolves with the ID a retry finds', async () => {
    getHardwareId.and.callFake(() => {
      callTimes.push(Date.now());
      return Promise.resolve(
        callTimes.length < 2 ? PLACEHOLDER : { hardwareId: 'UUID-2' }
      );
    });

    const result = service.waitForUsableHardwareId();
    await advance(6000);

    expect(await result).toBe('UUID-2');
  });

  it('stops when the caller says so', async () => {
    let keepGoing = true;
    const result = service.waitForUsableHardwareId(() => keepGoing);
    await advance(6000);
    keepGoing = false;
    await advance(1000);

    expect(await result).toBeNull();
    const calls = callTimes.length;
    await advance(60 * 1000);
    expect(callTimes.length).toBe(calls);
  });
});
