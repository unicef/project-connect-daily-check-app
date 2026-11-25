import { HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { requestPath, toReportableError } from './sentry.service';

describe('toReportableError', () => {
  it('keeps an Error as it is', () => {
    const error = new TypeError('boom');
    expect(toReportableError(error)).toBe(error);
  });

  it('names a failed HTTP call by its status and endpoint', () => {
    const response = new HttpErrorResponse({
      status: 404,
      statusText: 'Not Found',
      url: 'https://meter.example.org/api/v1/dailycheckapp_schools/02c63702-b27b-4a7f-8013-309d34860ce9?x=1',
      headers: new HttpHeaders(),
    });

    const error = toReportableError(response);

    expect(error).toEqual(jasmine.any(Error));
    expect(error.name).toBe('HttpErrorResponse');
    expect(error.message).toBe(
      'HTTP 404 from meter.example.org/api/v1/dailycheckapp_schools/:id'
    );
  });

  it('says when an HTTP call never got a response', () => {
    const response = new HttpErrorResponse({ status: 0, url: 'https://meter.example.org/api/v1/ip-metadata/203.0.113.7' });

    expect(toReportableError(response).message).toBe(
      'HTTP request failed from meter.example.org/api/v1/ip-metadata/:id'
    );
  });

  it('turns strings and other values into Errors', () => {
    expect(toReportableError('plain text').message).toBe('plain text');
    expect(toReportableError({ message: 'from an object' }).message).toBe('from an object');
    expect(toReportableError(undefined).message).toBe('Non-Error value: [object Undefined]');
    expect(toReportableError({ code: 1 }).message).toBe('Non-Error value: [object Object]');
  });
});

describe('requestPath', () => {
  it('keeps names and drops ids, numbers and the query', () => {
    expect(requestPath('https://h.example.org/api/v1/schools/features_flags/abc-school?k=v')).toBe(
      'h.example.org/api/v1/schools/features_flags/abc-school'
    );
    expect(requestPath('https://h.example.org/api/v1/schools/1234')).toBe('h.example.org/api/v1/schools/:id');
  });

  it('copes with a missing or broken URL', () => {
    expect(requestPath(null)).toBe('an unknown URL');
    expect(requestPath('not a url')).toBe('an unknown URL');
  });
});
