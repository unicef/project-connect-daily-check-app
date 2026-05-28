import { Component, OnDestroy } from '@angular/core';
import { Subscription } from 'rxjs';
import {
  TracerouteEvent,
  TracerouteHop,
  TracerouteService,
} from 'src/app/services/traceroute.service';

@Component({
  selector: 'app-traceroute',
  templateUrl: './traceroute.component.html',
  styleUrls: ['./traceroute.component.scss'],
  standalone: false,
})
export class TracerouteComponent implements OnDestroy {
  target = '';
  running = false;
  hops: TracerouteHop[] = [];
  infoLines: string[] = [];
  errorMessage: string | null = null;
  statusMessage: string | null = null;
  startedAt: number | null = null;
  finishedAt: number | null = null;
  resolvedCmd: string | null = null;
  private sub: Subscription | null = null;

  constructor(public traceroute: TracerouteService) {}

  get available(): boolean {
    return this.traceroute.isAvailable;
  }

  get elapsedSeconds(): number | null {
    if (!this.startedAt) return null;
    const end = this.finishedAt ?? Date.now();
    return Math.round((end - this.startedAt) / 100) / 10;
  }

  formatRtt(rtt: number | null): string {
    return rtt == null ? '*' : `${rtt.toFixed(rtt >= 100 ? 0 : 1)} ms`;
  }

  run(): void {
    const validationError = this.traceroute.validateTarget(this.target);
    if (validationError) {
      this.errorMessage = validationError;
      return;
    }
    this.resetState();
    this.running = true;
    this.startedAt = Date.now();
    this.statusMessage = `Tracing ${this.target.trim()}…`;
    this.sub = this.traceroute.run(this.target.trim()).subscribe({
      next: (e) => this.handleEvent(e),
      error: (err) => {
        this.errorMessage = err?.message || String(err);
        this.running = false;
        this.finishedAt = Date.now();
      },
      complete: () => {
        this.running = false;
        this.finishedAt = Date.now();
      },
    });
  }

  cancel(): void {
    this.traceroute.cancel();
    this.statusMessage = 'Cancelling…';
  }

  clear(): void {
    if (this.running) return;
    this.resetState();
  }

  private resetState(): void {
    this.hops = [];
    this.infoLines = [];
    this.errorMessage = null;
    this.statusMessage = null;
    this.startedAt = null;
    this.finishedAt = null;
    this.resolvedCmd = null;
    this.sub?.unsubscribe();
    this.sub = null;
  }

  private handleEvent(event: TracerouteEvent): void {
    switch (event.kind) {
      case 'started':
        this.resolvedCmd = `${event.cmd} ${event.args.join(' ')}`;
        break;
      case 'hop':
        this.hops = [...this.hops, event.hop];
        break;
      case 'info':
        this.infoLines = [...this.infoLines, event.line];
        break;
      case 'error':
        this.errorMessage = event.message;
        break;
      case 'done':
        if (event.signal) {
          this.statusMessage = `Trace cancelled (${event.signal}).`;
        } else if (event.code === 0 || event.code == null) {
          this.statusMessage = `Trace finished (${this.hops.length} hops).`;
        } else {
          this.statusMessage = `Trace exited with code ${event.code}.`;
        }
        break;
    }
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
    if (this.running) {
      this.traceroute.cancel();
    }
    if (this.available) {
      (window as any).electronAPI.removeTracerouteListeners();
    }
  }
}
