import { TestBed } from '@angular/core/testing';

import { IdentityService } from './identity.service';

describe('IdentityService', () => {
  let service: IdentityService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    service = TestBed.inject(IdentityService);
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('legacy || new fallbacks', () => {
    it('getFacilityId prefers the new key over the legacy one', () => {
      localStorage.setItem('schoolId', 'legacy-1');
      localStorage.setItem('facilityId', 'new-1');
      expect(service.getFacilityId()).toBe('new-1');
    });

    it('getFacilityId falls back to legacy schoolId', () => {
      localStorage.setItem('schoolId', 'legacy-1');
      expect(service.getFacilityId()).toBe('legacy-1');
    });

    it('getFacilityId returns null when neither key exists', () => {
      expect(service.getFacilityId()).toBeNull();
    });

    it('getFacilityType defaults to school for legacy installs', () => {
      expect(service.getFacilityType()).toBe('school');
    });

    it('getFacilityType returns the stored type when present', () => {
      localStorage.setItem('facilityType', 'health');
      expect(service.getFacilityType()).toBe('health');
    });

    it('getRegistrationId returns null for legacy installs', () => {
      expect(service.getRegistrationId()).toBeNull();
    });

    it('getLegacyBrowserId reads the legacy schoolUserId key', () => {
      localStorage.setItem('schoolUserId', 'user-9');
      expect(service.getLegacyBrowserId()).toBe('user-9');
    });

    it('getFacilityInfo falls back to the legacy schoolInfo blob', () => {
      localStorage.setItem('schoolInfo', JSON.stringify({ name: 'Escuela' }));
      expect(service.getFacilityInfo()).toEqual({ name: 'Escuela' });
    });

    it('getFacilityInfo returns null on corrupt JSON', () => {
      localStorage.setItem('schoolInfo', '{not-json');
      expect(service.getFacilityInfo()).toBeNull();
    });
  });

  describe('installation id', () => {
    it('generates, persists and reuses a UUID', () => {
      const first = service.getInstallationId();
      expect(first).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      );
      expect(localStorage.getItem('installationId')).toBe(first);
      expect(service.getInstallationId()).toBe(first);
    });
  });

  describe('isRegistered', () => {
    it('is false on a fresh install', () => {
      expect(service.isRegistered()).toBeFalse();
    });

    it('is true for a legacy school install (old keys only)', () => {
      localStorage.setItem('schoolId', '123');
      expect(service.isRegistered()).toBeTrue();
    });

    it('is true for a new-key install', () => {
      localStorage.setItem('gigaId', 'giga-1');
      expect(service.isRegistered()).toBeTrue();
    });
  });

  describe('reconcileOnLaunch', () => {
    it('assigns an installationId to every install', async () => {
      await service.reconcileOnLaunch();
      expect(localStorage.getItem('installationId')).toBeTruthy();
    });

    it('backfills facilityType=school for a registered legacy install', async () => {
      localStorage.setItem('schoolId', '123');
      localStorage.setItem('gigaId', 'giga-1');
      await service.reconcileOnLaunch();
      expect(localStorage.getItem('facilityType')).toBe('school');
    });

    it('does not set facilityType on a fresh (unregistered) install', async () => {
      await service.reconcileOnLaunch();
      expect(localStorage.getItem('facilityType')).toBeNull();
    });

    it('does not overwrite an existing facilityType', async () => {
      localStorage.setItem('gigaId', 'giga-1');
      localStorage.setItem('facilityType', 'health');
      await service.reconcileOnLaunch();
      expect(localStorage.getItem('facilityType')).toBe('health');
    });

    it('is idempotent across launches', async () => {
      localStorage.setItem('schoolId', '123');
      await service.reconcileOnLaunch();
      const installationId = localStorage.getItem('installationId');
      await service.reconcileOnLaunch();
      expect(localStorage.getItem('installationId')).toBe(installationId);
      expect(localStorage.getItem('facilityType')).toBe('school');
    });
  });
});
