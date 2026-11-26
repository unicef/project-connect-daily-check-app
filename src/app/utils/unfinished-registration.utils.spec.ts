import { forgetUnfinishedRegistration } from './unfinished-registration.utils';

describe('forgetUnfinishedRegistration', () => {
  const seed = (values: Record<string, string>) =>
    Object.entries(values).forEach(([key, value]) =>
      localStorage.setItem(key, value)
    );
  const stored = () => {
    const values: Record<string, string> = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      values[key] = localStorage.getItem(key);
    }
    return values;
  };

  /** What a not yet registered install keeps through the repair. */
  const unregistered = {
    savedSettings: JSON.stringify({ applicationLanguage: { code: 'es' } }),
    system_hardware_id: JSON.stringify({ hardwareId: 'UUID-1' }),
    appInstanceId: '6f1c2a4e-1b7d-4c1e-9a55-0c1f7e2d3b4a',
    appInstanceSchool: 'giga-1',
    pendingAutoRegistration: 'true',
    historicalData: JSON.stringify({ measurements: [{ uuid: 'm-1' }] }),
    historicalDataAll: JSON.stringify({ measurements: [{ uuid: 'm-1' }] }),
  };

  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  describe('after a registration that failed', () => {
    it('forgets the schoolId the flagged-school answer saved, and keeps the rest', () => {
      seed({
        ...unregistered,
        schoolId: 'ext-1',
        detectedCountry: 'PT',
        selectedCountry: 'ES',
      });

      expect(forgetUnfinishedRegistration()).toBeTrue();

      expect(stored()).toEqual(unregistered);
    });

    it('forgets an unreadable school saved with it', () => {
      seed({ schoolId: 'ext-1', schoolInfo: 'undefined' });

      expect(forgetUnfinishedRegistration()).toBeTrue();

      expect(stored()).toEqual({});
    });
  });

  describe('leaves a registration alone', () => {
    const untouched = (values: Record<string, string>) => {
      seed(values);
      expect(forgetUnfinishedRegistration()).toBeFalse();
      expect(stored()).toEqual(values);
    };

    it('made by hand in 2.0.4', () =>
      untouched({
        ...unregistered,
        pendingAutoRegistration: '',
        deviceType: 'windows',
        macAddress: 'device-1',
        schoolUserId: 'user-1',
        schoolId: 'ext-1',
        gigaId: 'giga-1',
        ip_address: '203.0.113.10',
        version: '2.0.4',
        country_code: 'ES',
        schoolInfo: JSON.stringify({ name: 'Escuela Uno', country: 'ES' }),
        detectedCountry: 'PT',
        selectedCountry: 'ES',
      }));

    it('made by hand in 1.0.0', () =>
      untouched({
        deviceType: 'windows',
        macAddress: 'device-1',
        schoolUserId: 'user-1',
        schoolId: 'ext-1',
        gigaId: 'giga-1',
        schoolInfo: JSON.stringify({ name: 'Escuela Uno' }),
      }));

    it('found by hardware ID (2.0.2 on) when the backend sent no school record', () =>
      untouched({
        schoolUserId: 'user-1',
        schoolId: 'ext-1',
        school_id: 'ext-1',
        gigaId: 'giga-1',
        country_code: 'ES',
      }));

    it('found by hardware ID when the backend sent no user ID', () =>
      untouched({ schoolId: 'ext-1', school_id: 'ext-1', gigaId: 'giga-1' }));

    it('found by hardware ID when the backend sent no Giga ID', () =>
      untouched({ schoolUserId: 'user-1', schoolId: 'ext-1' }));
  });

  it('does nothing when the app is not registered', () => {
    seed({ ...unregistered, schoolId: '' });

    expect(forgetUnfinishedRegistration()).toBeFalse();

    expect(stored()).toEqual({ ...unregistered, schoolId: '' });
  });

  it('does not throw when storage cannot be read', () => {
    const broken = {
      getItem: () => {
        throw new Error('SecurityError');
      },
    } as unknown as Storage;

    expect(forgetUnfinishedRegistration(broken)).toBeFalse();
  });
});
