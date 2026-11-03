import { NavigationEnd } from '@angular/router';
import { Subject } from 'rxjs';
import posthog from 'posthog-js';
import { environment } from 'src/environments/environment';
import { PosthogService } from './posthog.service';

describe('PosthogService', () => {
  const originalConfig = environment.posthog;
  let routerEvents: Subject<any>;
  let service: PosthogService;

  beforeEach(() => {
    (environment as any).posthog = {
      ...originalConfig,
      apiKey: 'phc_test',
      host: 'https://eu.i.posthog.com',
    };
    spyOn(posthog, 'init');
    spyOn(posthog, 'identify');
    spyOn(posthog, 'group');
    spyOn(posthog, 'capture');
    routerEvents = new Subject();
    service = new PosthogService({ events: routerEvents } as any);
  });

  afterEach(() => {
    (environment as any).posthog = originalConfig;
    localStorage.removeItem('gigaId');
  });

  it('identifies the stored school and joins its group on init', () => {
    localStorage.setItem('gigaId', 'giga-123');

    service.init();

    expect(posthog.identify).toHaveBeenCalledWith('giga-123', undefined);
    expect(posthog.group).toHaveBeenCalledWith('school', 'giga-123', {
      giga_id_school: 'giga-123',
    });
  });

  it('sends the initial page view and later route changes', () => {
    service.init();
    routerEvents.next(new NavigationEnd(1, '/home', '/home'));

    const pageviews = (posthog.capture as jasmine.Spy).calls
      .allArgs()
      .filter(([event]) => event === '$pageview');
    expect(pageviews.length).toBe(2);
  });

  it('does not identify when no school is registered', () => {
    service.init();

    expect(posthog.identify).not.toHaveBeenCalled();
    expect(posthog.group).not.toHaveBeenCalled();
  });

  it('does nothing without an API key', () => {
    (environment as any).posthog = { ...originalConfig, apiKey: '' };

    service.init();

    expect(posthog.init).not.toHaveBeenCalled();
  });
});
