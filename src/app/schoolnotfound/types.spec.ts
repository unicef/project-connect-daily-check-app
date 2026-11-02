import { HttpErrorResponse } from '@angular/common/http';
import { TimeoutError } from 'rxjs';
import { NotFound, classifyRequestError } from './types';

describe('classifyRequestError', () => {
  const http = (status: number) => new HttpErrorResponse({ status });

  beforeEach(() => spyOnProperty(navigator, 'onLine').and.returnValue(true));

  it('treats a request that never reached the server as a network error', () => {
    expect(classifyRequestError(http(0))).toBe(NotFound.network);
  });

  it('treats the browser being offline as a network error', () => {
    (Object.getOwnPropertyDescriptor(navigator, 'onLine')?.get as jasmine.Spy)
      ?.and.returnValue(false);
    expect(classifyRequestError(http(500))).toBe(NotFound.network);
  });

  it('maps timeouts', () => {
    expect(classifyRequestError(new TimeoutError())).toBe(NotFound.timeout);
    expect(classifyRequestError(http(504))).toBe(NotFound.timeout);
    expect(classifyRequestError(http(408))).toBe(NotFound.timeout);
  });

  it('maps 5xx to a server error', () => {
    expect(classifyRequestError(http(500))).toBe(NotFound.server);
    expect(classifyRequestError(http(503))).toBe(NotFound.server);
  });

  it('never reports a failed request as "school not found"', () => {
    expect(classifyRequestError(http(404))).toBe(NotFound.unknown);
    expect(classifyRequestError(new Error('boom'))).toBe(NotFound.unknown);
  });

  it('uses the given fallback for errors it cannot attribute', () => {
    expect(
      classifyRequestError(http(400), NotFound.registrationFailed)
    ).toBe(NotFound.registrationFailed);
  });
});
