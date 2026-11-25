import { NavigationEnd } from '@angular/router';
import { Subject } from 'rxjs';
import posthog from 'posthog-js';
import { environment } from 'src/environments/environment';
import { PosthogService } from './posthog.service';

describe('PosthogService', () => {
  const originalConfig = environment.posthog;
  // The backend's device ID (TECH-8828): one physical PC across registrations.
  const DEVICE_ID = '7d0f5c1e-3a52-4f7e-9a0c-2b9f1f6d4e21';
  const HARDWARE_ID = '4c4c4544-0042-3510-8051-b4c04f4e3432';
  const REGISTRATION_ID = 'b987916f-8b40-4f3b-b0a3-c32b10a4658c';
  // The ID this app instance generated for its registration.
  const APP_INSTANCE_ID = '3f2b8c1a-6d4e-4f7a-9b2c-1e5d8a7f6c3b';
  let routerEvents: Subject<any>;
  let identified: boolean;
  let distinctId: string;
  let service: PosthogService;

  beforeEach(() => {
    (environment as any).posthog = {
      ...originalConfig,
      apiKey: 'phc_test',
      host: 'https://eu.i.posthog.com',
    };
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
    service = new PosthogService({ events: routerEvents } as any);
  });

  afterEach(() => {
    (environment as any).posthog = originalConfig;
    localStorage.removeItem('gigaId');
    localStorage.removeItem('schoolUserId');
    localStorage.removeItem('device_id');
    localStorage.removeItem('appInstanceId');
  });

  it('identifies the PC by its device ID and joins its school group', () => {
    localStorage.setItem('device_id', DEVICE_ID);
    localStorage.setItem('schoolUserId', REGISTRATION_ID);
    localStorage.setItem('gigaId', 'giga-123');

    service.init();

    expect(posthog.identify).toHaveBeenCalledOnceWith(DEVICE_ID, undefined);
    expect(posthog.group).toHaveBeenCalledWith('school', 'giga-123', {
      giga_id_school: 'giga-123',
    });
  });

  it('sends the app instance with every event, as a property and a group', () => {
    localStorage.setItem('device_id', DEVICE_ID);
    localStorage.setItem('schoolUserId', REGISTRATION_ID);
    localStorage.setItem('appInstanceId', APP_INSTANCE_ID);

    service.init();

    expect(posthog.register).toHaveBeenCalledWith({
      app_instance_id: APP_INSTANCE_ID,
    });
    expect(posthog.group).toHaveBeenCalledWith(
      'app_instance',
      APP_INSTANCE_ID,
      undefined
    );
    // The person stays the device: every app instance on it is the same one.
    expect(posthog.identify).toHaveBeenCalledOnceWith(DEVICE_ID, undefined);
  });

  it('describes the app instance in its group when it registers', () => {
    localStorage.setItem('schoolUserId', REGISTRATION_ID);
    localStorage.setItem('appInstanceId', APP_INSTANCE_ID);
    service.init();

    service.applyAppInstance({ registration_source: 'auto' });

    expect(posthog.group).toHaveBeenCalledWith('app_instance', APP_INSTANCE_ID, {
      registration_source: 'auto',
    });
  });

  it('leaves out an app instance ID made for a registration that never went through', () => {
    // appInstanceIdFor() stores the ID before the registration is sent.
    localStorage.setItem('appInstanceId', APP_INSTANCE_ID);

    service.init();

    expect(posthog.register).not.toHaveBeenCalledWith({
      app_instance_id: APP_INSTANCE_ID,
    });
    const groupTypes = (posthog.group as jasmine.Spy)
      .calls.allArgs()
      .map((args) => args[0]);
    expect(groupTypes).not.toContain('app_instance');
  });

  it('stays anonymous until the backend has given a device ID', () => {
    // Registered, with a hardware ID, but no device ID yet: neither is the
    // person any more.
    localStorage.setItem('schoolUserId', REGISTRATION_ID);
    localStorage.setItem('gigaId', 'giga-123');

    service.init();

    expect(posthog.identify).not.toHaveBeenCalled();
    // Still in its school's group.
    expect(posthog.group).toHaveBeenCalledWith(
      'school',
      'giga-123',
      jasmine.anything()
    );
  });

  it('identifies the PC once the device ID arrives', () => {
    service.init();
    expect(posthog.identify).not.toHaveBeenCalled();

    localStorage.setItem('device_id', DEVICE_ID);
    service.identifyDevice();

    expect(posthog.identify).toHaveBeenCalledOnceWith(DEVICE_ID, undefined);
  });

  [HARDWARE_ID, REGISTRATION_ID, 'giga-123', 'an-older-device-id'].forEach(
    (oldId) => {
      it(`moves an install identified as "${oldId}" to its device ID`, () => {
        identified = true;
        distinctId = oldId;
        localStorage.setItem('device_id', DEVICE_ID);
        localStorage.setItem('gigaId', 'giga-123');

        service.init();

        expect(posthog.reset).toHaveBeenCalled();
        expect(posthog.identify).toHaveBeenCalledWith(DEVICE_ID, undefined);
        // The school group is set again after the reset
        expect(posthog.group).toHaveBeenCalledWith('school', 'giga-123', {
          giga_id_school: 'giga-123',
        });
      });
    }
  );

  it('updates the person properties when the identity is already right', () => {
    identified = true;
    distinctId = DEVICE_ID;
    localStorage.setItem('device_id', DEVICE_ID);
    service.init();

    service.identifyDevice({ country_code: 'ES' });

    expect(posthog.identify).not.toHaveBeenCalled();
    expect(posthog.reset).not.toHaveBeenCalled();
    expect(posthog.setPersonProperties).toHaveBeenCalledWith({
      country_code: 'ES',
    });
  });

  it('passes the registration properties with the identity', () => {
    service.init();
    localStorage.setItem('device_id', DEVICE_ID);

    service.identifyDevice({ country_code: 'ES' });

    expect(posthog.identify).toHaveBeenCalledWith(DEVICE_ID, {
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
    localStorage.setItem('device_id', DEVICE_ID);

    service.init();
    service.identifyDevice();
    service.reset();

    expect(posthog.init).not.toHaveBeenCalled();
    expect(posthog.identify).not.toHaveBeenCalled();
    expect(posthog.reset).not.toHaveBeenCalled();
  });

  it('sends an event at once when the page is about to go away', () => {
    service.init();

    service.captureNow('logout_completed', { backend_deactivated: true });

    expect(posthog.capture).toHaveBeenCalledWith(
      'logout_completed',
      { backend_deactivated: true },
      { send_instantly: true, transport: 'sendBeacon' }
    );
  });

  it('adds the standard failure fields to a failure event', () => {
    service.init();

    service.captureFailure(
      'registration_failed',
      new Error('boom'),
      { country_code: 'ES' },
      'registration_failed'
    );

    expect(posthog.capture).toHaveBeenCalledWith('registration_failed', {
      error_code: 'registration_failed',
      http_status: null,
      endpoint: null,
      error_message: 'boom',
      country_code: 'ES',
    });
  });

  it('joins the country group of a registered PC', () => {
    localStorage.setItem('country_code', 'es');
    try {
      service.init();
    } finally {
      localStorage.removeItem('country_code');
    }

    expect(posthog.group).toHaveBeenCalledWith('country', 'ES', {
      country_code: 'ES',
    });
  });
});
