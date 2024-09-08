import { ScheduleService } from '../services/schedule.service';

// Mock services
class MockStorageService {
  private storage: { [key: string]: string } = {};
  get(key: string): string | null {
    return this.storage[key] || null;
  }
  set(key: string, value: string): void {
    this.storage[key] = value;
  }
}

class MockMeasurementClientService {
  async runTest(intervalType: string): Promise<void> {
    console.log(`Running test for interval type: ${intervalType}`);
  }
}

class MockSettingsService {
  get(key: string): any {
    return key === 'scheduledTesting' ? true : null;
  }
}

class MockSharedService {
  broadcast(event: string, data: any): void {
    console.log(`Broadcasting event: ${event}, data: ${JSON.stringify(data)}`);
  }
}

class MockNetworkService {
  async getNetworkInfo(): Promise<any> {
    return {};
  }
}

// New helper function for formatting semaphore data
function formatSemaphore(semaphore: any[]): string {
  return semaphore
    .map((schedule) => {
      const start = new Date(schedule.start).toLocaleString();
      const end = new Date(schedule.end).toLocaleString();
      const choice = new Date(schedule.choice).toLocaleString();
      return `
    Slot Type: ${schedule.slotType}
    Start: ${start}
    End: ${end}
    Choice: ${choice}
    Interval Type: ${schedule.intervalType}
    `;
    })
    .join('\n');
}

// Updated test runner
export async function runScheduleTest() {
  const storageService = new MockStorageService();
  const measurementClientService = new MockMeasurementClientService();
  const settingsService = new MockSettingsService();
  const sharedService = new MockSharedService();
  const networkService = new MockNetworkService();

  const scheduleService = new ScheduleService(
    storageService as any,
    measurementClientService as any,
    settingsService as any,
    sharedService as any,
    networkService as any
  );

  console.log('Initial setup:');
  await scheduleService.initiate();
  logSchedules(storageService);

  console.log('\nGetting semaphore:');
  const semaphore = scheduleService.getSemaphore();
  console.log('Semaphore:', formatSemaphore(semaphore));

  console.log('\nAdvancing time by 4 hours:');
  advanceTime(4 * 60 * 60 * 1000);
  await scheduleService.watch();
  logSchedules(storageService);

  console.log('\nGetting semaphore after 4 hours:');
  const semaphoreAfter4Hours = scheduleService.getSemaphore();
  console.log(
    'Semaphore after 4 hours:',
    formatSemaphore(semaphoreAfter4Hours)
  );

  console.log('\nAdvancing time by 8 hours:');
  advanceTime(8 * 60 * 60 * 1000);
  await scheduleService.watch();
  logSchedules(storageService);

  console.log('\nGetting semaphore after 12 hours:');
  const semaphoreAfter12Hours = scheduleService.getSemaphore();
  console.log(
    'Semaphore after 12 hours:',
    formatSemaphore(semaphoreAfter12Hours)
  );

  console.log('\nAdvancing time by 24 hours:');
  advanceTime(24 * 60 * 60 * 1000);
  await scheduleService.watch();
  logSchedules(storageService);

  console.log('\nGetting semaphore after 36 hours:');
  const semaphoreAfter36Hours = scheduleService.getSemaphore();
  console.log(
    'Semaphore after 36 hours:',
    formatSemaphore(semaphoreAfter36Hours)
  );
}

// Updated helper function
function logSchedules(storageService: MockStorageService) {
  const schedules = JSON.parse(storageService.get('schedules') || '[]');
  console.log('Current schedules:', formatSemaphore(schedules));
}

function advanceTime(ms: number) {
  const mockNow = Date.now() + ms;
  const originalNow = Date.now;
  Date.now = () => mockNow;
  console.log(`Time advanced to: ${new Date(mockNow).toISOString()}`);
  return () => {
    Date.now = originalNow;
  };
}
