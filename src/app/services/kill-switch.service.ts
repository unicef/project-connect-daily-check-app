import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { interval, switchMap, of, map, catchError } from 'rxjs';
import { environment } from 'src/environments/_environment.prod';
import { HardwareIdService } from './hardware-id.service';

@Injectable({
  providedIn: 'root',
})
export class KillSwitchService {
  constructor(private http: HttpClient,
    private hardwareIdService: HardwareIdService) { }

  startKillSwitchPolling() {
    // Run every hour
    interval(60 * 1000)
      .pipe(
        switchMap(() => {
          const schoolId = localStorage.getItem('school_id');

          // If school_id missing → SKIP this cycle
          if (!schoolId) {
            console.info('KillSwitch skipped — no school_id found.');
            return of(true); // treat as allowed
          }

          return this.checkStatusFromServer(schoolId);
        })
      )
      .subscribe((isAllowed) => {
        if (!isAllowed) {
          this.triggerKillSwitch();
        }
      });

    // Immediate first check
    const schoolId = localStorage.getItem('school_id');
    if (schoolId) {
      this.checkStatusFromServer(schoolId).subscribe(isAllowed => {
        if (!isAllowed) {
          this.triggerKillSwitch();
        }
      });
    }
  }



  private checkStatusFromServer(schoolId: string) {
    const hardwareId = this.hardwareIdService.getHardwareId();

    
    const payload = {
      device_hardware_id: hardwareId,
      giga_id_school: schoolId,
    };

    return this.http
      .post<any>(
        `${environment.restAPI}dailycheckapp_schools/check-device-school-status`,
        payload
      )
      .pipe(
        map(
          (resp) => resp?.data?.isActive === true
        ),
        catchError((err) => {
          console.error('❌ KillSwitch API error:', err);
          return of(false); // secure fallback
        })
      );
  }


  private async triggerKillSwitch() {
    console.warn('Kill Switch Activated — App Disabled');

    // Clear all storages
    localStorage.clear();
    sessionStorage.clear();

    // Delete all IndexedDB databases
    const dbs = await indexedDB.databases();
    for (const db of dbs) {
      if (db.name) indexedDB.deleteDatabase(db.name);
    }

    // Clear caches
    if ('caches' in window) {
      const cacheNames = await caches.keys();
      for (const name of cacheNames) {
        await caches.delete(name);
      }
    }

    // Redirect to disabled screen
    window.location.href = '/';
  }
}
