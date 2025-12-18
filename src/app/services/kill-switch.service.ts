import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { interval, switchMap, of, map } from 'rxjs';
import { environment } from 'src/environments/_environment.prod';

@Injectable({
  providedIn: 'root',
})
export class KillSwitchService {
  constructor(private http: HttpClient) {}

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
    return this.http.get<any>(`${environment.restAPI}dailycheckapp_schools/id/${schoolId}`)
      .pipe(
        map(resp => resp.schoolActive === true)
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
