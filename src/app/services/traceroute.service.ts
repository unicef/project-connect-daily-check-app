import { Injectable } from '@angular/core';
import { Observable, Subject } from 'rxjs';

export interface TracerouteHop {
  hop: number;
  host: string | null;
  ip: string | null;
  rtts: (number | null)[];
  raw: string;
}

export type TracerouteEvent =
  | { kind: 'started'; target: string; cmd: string; args: string[] }
  | { kind: 'hop'; hop: TracerouteHop }
  | { kind: 'info'; line: string; stderr?: boolean }
  | { kind: 'done'; code: number | null; signal: string | null }
  | { kind: 'error'; message: string };

const HOSTNAME_OR_IP = /^[A-Za-z0-9.:\-]{1,253}$/;

@Injectable({ providedIn: 'root' })
export class TracerouteService {
  get isAvailable(): boolean {
    return !!(window as any).electronAPI?.runTraceroute;
  }

  validateTarget(target: string): string | null {
    const t = (target || '').trim();
    if (!t) return 'Enter a hostname or IP.';
    if (!HOSTNAME_OR_IP.test(t)) {
      return 'Only letters, digits, dots, colons and hyphens are allowed.';
    }
    return null;
  }

  run(target: string): Observable<TracerouteEvent> {
    const subject = new Subject<TracerouteEvent>();
    if (!this.isAvailable) {
      queueMicrotask(() => {
        subject.next({ kind: 'error', message: 'Traceroute is only available in the desktop app.' });
        subject.complete();
      });
      return subject.asObservable();
    }
    const api = (window as any).electronAPI;
    api.removeTracerouteListeners();
    api.onTracerouteStarted((data: any) => subject.next({ kind: 'started', ...data }));
    api.onTracerouteHop((hop: TracerouteHop) => subject.next({ kind: 'hop', hop }));
    api.onTracerouteInfo((info: any) => subject.next({ kind: 'info', line: info.line, stderr: info.stderr }));
    api.onTracerouteError((data: any) => {
      subject.next({ kind: 'error', message: data?.message || 'Unknown error' });
    });
    api.onTracerouteDone((data: any) => {
      subject.next({ kind: 'done', code: data?.code ?? null, signal: data?.signal ?? null });
      subject.complete();
      api.removeTracerouteListeners();
    });

    api.runTraceroute(target).then((res: any) => {
      if (!res?.ok) {
        subject.next({ kind: 'error', message: res?.error || 'Failed to start traceroute.' });
        subject.complete();
        api.removeTracerouteListeners();
      }
    });
    return subject.asObservable();
  }

  cancel(): Promise<void> {
    if (!this.isAvailable) return Promise.resolve();
    return (window as any).electronAPI.cancelTraceroute();
  }
}
