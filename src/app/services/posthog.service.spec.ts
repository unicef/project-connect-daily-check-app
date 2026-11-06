import { NavigationEnd } from '@angular/router';
import { Subject } from 'rxjs';
import posthog from 'posthog-js';
import { environment } from 'src/environments/environment';
import { PosthogService } from './posthog.service';

describe('PosthogService', () => {
  const originalConfig = environment.posthog;
  const HARDWARE_ID = '4c4c4544-0042-3510-8051-b4c04f4e3432';
  const REGISTRATION_ID = 'b987916f-8b40-4f3b-b0a3-c32b10a4658c';
  let routerEvents: Subject<any>;
  let hardwareId: string | null;
  let identified: boolean;
  let distinctId: string;
  let service: PosthogService;

  beforeEach(() => {
    (environment as any).posthog = {
      ...originalConfig,
      apiKey: 'phc_test',
      host: 'https://eu.i.posthog.com',
    };
    hardwareId = null;
    identified = false;
    distinctId = 'anonymous-uuid';
    spyOn(posthog, 'init');
    spyOn(posthog, 'identify');
    spyOn(posthog, 'group');
    spyOn(posthog, 'capture');
    spyOn(posthog, 'register');
    spyOn(posthog, 'reset');
    spyOn(posthog, 'setPersonProperties');
    spyOn(posthog, '_isIdentified').and.callFake(() => identified);
    spyOn(posthog, 'get_distinct_id').and.callFake(() => distinctId);
    routerEvents = new Subject();
    service = new PosthogService(
      { events: routerEvents } as any,
      { getHardwareId: () => hardwareId } as any
    );
  });

  afterEach(() => {
    (environment as any).posthog = originalConfig;
    localStorage.removeItem('gigaId');
    localStorage.removeItem('schoolUserId');
  });

  it('identifies the PC by its hardware ID and joins its school group', () => {
    hardwareId = HARDWARE_ID;
    localStorage.setItem('schoolUserId', REGISTRATION_ID);
    localStorage.setItem('gigaId', 'giga-123');

    service.init();

    expect(posthog.identify).toHaveBeenCalledOnceWith(HARDWARE_ID, undefined);
    expect(posthog.group).toHaveBeenCalledWith('school', 'giga-123', {
      giga_id_school: 'giga-123',
    });
  });

  it('never identifies the PC by the school giga id', () => {
    hardwareId = HARDWARE_ID;
    localStorage.setItem('gigaId', 'giga-123');

    service.init();

    const ids = (posthog.identify as jasmine.Spy).calls
      .allArgs()
      .map(([id]) => id);
    expect(ids).toEqual([HARDWARE_ID]);
  });

  it('uses the registration ID when there is no hardware ID', () => {
    localStorage.setItem('schoolUserId', REGISTRATION_ID);

    service.init();

    expect(posthog.identify).toHaveBeenCalledOnceWith(
      REGISTRATION_ID,
      undefined
    );
  });

  [
    'NO_UUID_AVAILABLE',
    '00000000-0000-0000-0000-000000000000',
    'FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF',
    '03000200-0400-0500-0006-000700080009',
    'To be filled by O.E.M.',
    'Default string',
  ].forEach((placeholder) => {
    it(`uses the registration ID when the hardware ID is "${placeholder}"`, () => {
      hardwareId = placeholder;
      localStorage.setItem('schoolUserId', REGISTRATION_ID);

      service.init();

      expect(posthog.identify).toHaveBeenCalledOnceWith(
        REGISTRATION_ID,
        undefined
      );
    });
  });

  it('stays anonymous with neither a hardware ID nor a registration', () => {
    service.init();

    expect(posthog.identify).not.toHaveBeenCalled();
    expect(posthog.group).not.toHaveBeenCalled();
  });

  it('keeps an identity set earlier rather than starting a new person', () => {
    // Identified by the registration ID before the hardware ID was readable
    identified = true;
    distinctId = REGISTRATION_ID;
    hardwareId = HARDWARE_ID;
    localStorage.setItem('schoolUserId', REGISTRATION_ID);

    service.init();

    expect(posthog.identify).not.toHaveBeenCalled();
    expect(posthog.reset).not.toHaveBeenCalled();
  });

  it('updates the person properties when the identity is already right', () => {
    identified = true;
    distinctId = HARDWARE_ID;
    hardwareId = HARDWARE_ID;
    service.init();

    service.identifyDevice({ country_code: 'ES' });

    expect(posthog.identify).not.toHaveBeenCalled();
    expect(posthog.setPersonProperties).toHaveBeenCalledWith({
      country_code: 'ES',
    });
  });

  it('moves an install identified by the school giga id to the PC', () => {
    identified = true;
    distinctId = 'giga-123';
    hardwareId = HARDWARE_ID;
    localStorage.setItem('gigaId', 'giga-123');

    service.init();

    expect(posthog.reset).toHaveBeenCalled();
    expect(posthog.identify).toHaveBeenCalledWith(HARDWARE_ID, undefined);
    // The school group is set again after the reset
    expect((posthog.group as jasmine.Spy).calls.mostRecent().args).toEqual([
      'school',
      'giga-123',
      { giga_id_school: 'giga-123' },
    ]);
  });

  it('passes the registration properties with the identity', () => {
    service.init();
    hardwareId = HARDWARE_ID;

    service.identifyDevice({ country_code: 'ES' });

    expect(posthog.identify).toHaveBeenCalledWith(HARDWARE_ID, {
      country_code: 'ES',
    });
  });

  it('reset forgets the identity and keeps the app properties', () => {
    service.init();
    (posthog.register as jasmine.Spy).calls.reset();

    service.reset();

    expect(posthog.reset).toHaveBeenCalled();
    expect(posthog.register).toHaveBeenCalledWith(
      jasmine.objectContaining({ app_version: environment.app_version })
    );
  });

  it('sends the initial page view and later route changes', () => {
    service.init();
    routerEvents.next(new NavigationEnd(1, '/home', '/home'));

    const pageviews = (posthog.capture as jasmine.Spy).calls
      .allArgs()
      .filter(([event]) => event === '$pageview');
    expect(pageviews.length).toBe(2);
  });

  it('does nothing without an API key', () => {
    (environment as any).posthog = { ...originalConfig, apiKey: '' };
    hardwareId = HARDWARE_ID;

    service.init();
    service.identifyDevice();
    service.reset();

    expect(posthog.init).not.toHaveBeenCalled();
    expect(posthog.identify).not.toHaveBeenCalled();
    expect(posthog.reset).not.toHaveBeenCalled();
  });
});
