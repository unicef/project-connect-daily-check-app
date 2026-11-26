import { HttpErrorResponse } from '@angular/common/http';
import { TimeoutError } from 'rxjs';
import {
  bucketCount,
  classifyMeasurementError,
  describeError,
  httpErrorCode,
  markLoggedOut,
  markOnboardingStarted,
  onboardingDurationMs,
  parseMeasurementRejection,
  registrationProps,
  sanitizeMessage,
  takeLoggedOutAt,
  templateUrl,
} from './analytics-events';

describe('analytics-events', () => {
  describe('templateUrl', () => {
    it('keeps the host and the words of the path, and drops IDs and the query', () => {
      expect(
        templateUrl(
          'https://uni-ooi-giga-meter-backend-stg.azurewebsites.net/api/v1/dailycheckapp_schools/checkDeviceStatus/4c4c4544-0042/spaintestschool5?token=secret'
        )
      ).toBe(
        'uni-ooi-giga-meter-backend-stg.azurewebsites.net/api/v1/dailycheckapp_schools/checkDeviceStatus/:id/:id'
      );
    });

    it('is null for nothing', () => {
      expect(templateUrl(null)).toBeNull();
    });
  });

  describe('sanitizeMessage', () => {
    it('removes tokens, IPs, MAC and e-mail addresses and Windows paths', () => {
      const cleaned = sanitizeMessage(
        'GET https://locate.measurementlab.net/v2/nearest?access_token=abc failed from 37.222.126.167 ' +
          'on aa:bb:cc:dd:ee:ff for me@school.org at C:\\Users\\Maria\\AppData\\x.log'
      );
      expect(cleaned).not.toContain('access_token');
      expect(cleaned).not.toContain('37.222.126.167');
      expect(cleaned).not.toContain('aa:bb:cc:dd:ee:ff');
      expect(cleaned).not.toContain('me@school.org');
      expect(cleaned).not.toContain('Maria');
      expect(cleaned).toContain('locate.measurementlab.net/v2/nearest');
    });

    it('cuts long messages', () => {
      expect(sanitizeMessage('x'.repeat(500))?.length).toBe(200);
    });

    it('is null for an empty message', () => {
      expect(sanitizeMessage('')).toBeNull();
      expect(sanitizeMessage(undefined)).toBeNull();
    });
  });

  it('names HTTP statuses the way dashboards group them', () => {
    expect(httpErrorCode(0)).toBe('network');
    expect(httpErrorCode(401)).toBe('http_401');
    expect(httpErrorCode(418)).toBe('http_4xx');
    expect(httpErrorCode(503)).toBe('http_5xx');
    expect(httpErrorCode(504)).toBe('timeout');
  });

  describe('describeError', () => {
    it("reads the backend's message from an HTTP error", () => {
      const error = new HttpErrorResponse({
        status: 400,
        url: 'https://api.example.org/api/v1/measurements',
        error: { statusCode: 400, message: 'Failed to add measurement with error: Wrong country code' },
      });
      expect(describeError(error)).toEqual({
        error_code: 'http_400',
        http_status: 400,
        endpoint: 'api.example.org/api/v1/measurements',
        error_message: 'Failed to add measurement with error: Wrong country code',
      });
    });

    it('recognises a request that never reached the server', () => {
      const error = new HttpErrorResponse({ status: 0, url: 'https://api.example.org/x' });
      expect(describeError(error).error_code).toBe('network');
    });

    it('recognises an rxjs timeout', () => {
      expect(describeError(new TimeoutError()).error_code).toBe('timeout');
    });

    it('uses the fallback code for anything else', () => {
      expect(describeError(new Error('boom'), 'registration_failed')).toEqual({
        error_code: 'registration_failed',
        http_status: null,
        endpoint: null,
        error_message: 'boom',
      });
    });
  });

  it('classifies speed-test failures', () => {
    expect(classifyMeasurementError('locate.measurementlab.net: Could not understand response')).toBe('locate_failed');
    expect(classifyMeasurementError('The download test did not produce a result')).toBe('no_result');
    expect(classifyMeasurementError("Failed to construct 'WebSocket': The URL 'undefined' is invalid.")).toBe('websocket_error');
    expect(classifyMeasurementError('net::ERR_INTERNET_DISCONNECTED')).toBe('network');
    expect(classifyMeasurementError('something odd')).toBe('unknown');
  });

  describe('parseMeasurementRejection', () => {
    const http400 = (message: string) =>
      new HttpErrorResponse({ status: 400, error: { statusCode: 400, message } });

    it('reads a single refused measurement', () => {
      expect(
        parseMeasurementRejection(
          http400('Failed to add measurement with error: PCDC school does not exist')
        )
      ).toEqual({ reason: 'school_doesnt_exist' });
    });

    it('reads a batch where every record was refused', () => {
      expect(
        parseMeasurementRejection(
          http400(
            'Failed to add measurements with error for each records : PCDC school does not exist,Wrong country code'
          )
        )
      ).toEqual({ reason: 'school_doesnt_exist,wrong_country_code' });
    });

    it('leaves every other failure to the retry queue', () => {
      expect(parseMeasurementRejection(http400('Validation failed'))).toBeNull();
      expect(
        parseMeasurementRejection(new HttpErrorResponse({ status: 500 }))
      ).toBeNull();
      expect(parseMeasurementRejection(new Error('offline'))).toBeNull();
    });
  });

  it('puts counts in bands', () => {
    expect([0, 1, 3, 7, 40].map(bucketCount)).toEqual(['0', '1', '2-3', '4-10', '11+']);
    expect(bucketCount(null)).toBe('unknown');
  });

  describe('flow markers', () => {
    // Specs that open the registration screens leave a start behind.
    beforeEach(() => {
      sessionStorage.removeItem('analytics_onboarding_started_at');
      localStorage.removeItem('analytics_logged_out_at');
    });

    afterEach(() => {
      sessionStorage.removeItem('analytics_onboarding_started_at');
      localStorage.removeItem('analytics_logged_out_at');
    });

    it('measures how long the onboarding took', () => {
      markOnboardingStarted(1000);
      expect(onboardingDurationMs(61000)).toBe(60000);
    });

    it('is null without a start', () => {
      expect(onboardingDurationMs()).toBeNull();
    });

    it('reports a logout once, to the first registration after it', () => {
      markLoggedOut(5000);
      expect(takeLoggedOutAt()).toBe(5000);
      expect(takeLoggedOutAt()).toBeNull();
    });
  });

  describe('registrationProps', () => {
    afterEach(() => localStorage.removeItem('analytics_logged_out_at'));

    it('describes how a registration came about and what it had to go by', () => {
      expect(
        registrationProps({
          country_code: 'ES',
          registration_source: 'auto',
          geolocation: { location: { lat: 1, lng: 2 }, accuracy: 30 },
          device_hardware_id: 'UUID-1',
          baseboard_serial: null,
          disk_serial: 'DISK-1',
        })
      ).toEqual({
        country_code: 'ES',
        registration_source: 'auto',
        is_reregistration: false,
        minutes_since_logout: null,
        has_geolocation: true,
        has_hardware_id: true,
        has_serials: true,
      });
    });

    it('marks the first registration after a logout, once', () => {
      markLoggedOut(1_000);

      const first = registrationProps({ registration_source: 'manual' }, 1_000 + 30 * 60_000);
      const second = registrationProps({ registration_source: 'manual' });

      expect(first).toEqual(
        jasmine.objectContaining({ is_reregistration: true, minutes_since_logout: 30 })
      );
      expect(second).toEqual(
        jasmine.objectContaining({ is_reregistration: false, has_serials: false })
      );
    });
  });
});
