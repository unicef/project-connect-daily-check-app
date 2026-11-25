import type { App, BrowserWindow, Details, RenderProcessGoneDetails, WebContents } from 'electron';
import * as Sentry from '@sentry/node';

/**
 * Keeps the app running after its page crashes or hangs.
 *
 * The app sits in the tray for days and its scheduler runs in the page. When
 * the page's process crashes (out of memory, a GPU driver fault) or hangs,
 * the window used to stay blank and no test ran until someone restarted the
 * app. Now the page is loaded again, a few times at most.
 */

/** Restarts allowed within RESTART_WINDOW_MS before the app stops trying. */
export const MAX_RESTARTS = 3;
export const RESTART_WINDOW_MS = 10 * 60 * 1000;
/** How long the page may stay unresponsive before it is restarted. */
export const HANG_LIMIT_MS = 2 * 60 * 1000;

/** Counts restarts in a sliding window, so a page that keeps crashing is not reloaded in a loop. */
export class RestartBudget {
  private restarts: number[] = [];

  constructor(
    private readonly max = MAX_RESTARTS,
    private readonly windowMs = RESTART_WINDOW_MS
  ) {}

  tryTake(now = Date.now()): boolean {
    this.restarts = this.restarts.filter((t) => now - t < this.windowMs);
    if (this.restarts.length >= this.max) {
      return false;
    }
    this.restarts.push(now);
    return true;
  }
}

/**
 * A process that ended without the app being at fault: it exited normally, or
 * something outside the app ended it (an installer, Task Manager, Windows
 * shutting down). Not reported as a crash.
 */
export function endedFromOutside(reason: string): boolean {
  return reason === 'clean-exit' || reason === 'killed';
}

const watchedPages = new WeakSet<WebContents>();

/** Restarts the main window's page after a crash, or after it hangs for HANG_LIMIT_MS. */
export function watchMainWindow(win: BrowserWindow, isQuitting: () => boolean): void {
  const page = win.webContents;
  watchedPages.add(page);
  const budget = new RestartBudget();
  let endingHungPage = false;
  let hangTimer: ReturnType<typeof setTimeout> | null = null;
  // From a restart until the new page has loaded: the old page's unanswered
  // input can still make Chromium report the window unresponsive.
  let restarting = false;

  const clearHangTimer = (): void => {
    if (hangTimer) {
      clearTimeout(hangTimer);
      hangTimer = null;
    }
  };

  const restart = (why: string): void => {
    if (isQuitting() || win.isDestroyed()) {
      return;
    }
    clearHangTimer();
    if (!budget.tryTake()) {
      console.log(`[recovery] not restarting the page after ${why}: restart limit reached`);
      Sentry.captureMessage(
        `Page not restarted after ${why}: already restarted ${MAX_RESTARTS} times in ${RESTART_WINDOW_MS / 60000} minutes`,
        Sentry.Severity.Error
      );
      return;
    }
    console.log(`[recovery] restarting the page after ${why}`);
    Sentry.addBreadcrumb({ category: 'recovery', message: `Restarting the page after ${why}` });
    restarting = true;
    page.reload();
  };

  page.on('did-finish-load', () => {
    restarting = false;
  });
  page.on('did-fail-load', () => {
    restarting = false;
  });

  page.on('render-process-gone', (_event, details: RenderProcessGoneDetails) => {
    console.log(`[recovery] page process ended: ${details.reason}${endingHungPage ? ' (ended for a hang)' : ''}`);
    if (isQuitting()) {
      return;
    }
    if (endingHungPage) {
      // Ended below on purpose; the reload is already on its way.
      endingHungPage = false;
      return;
    }
    if (endedFromOutside(details.reason)) {
      Sentry.addBreadcrumb({ category: 'recovery', message: `Page process ended: ${details.reason}` });
    } else {
      Sentry.withScope((scope) => {
        scope.setTag('reason', details.reason);
        scope.setExtra('exitCode', details.exitCode);
        Sentry.captureMessage(`Renderer process crashed: ${details.reason}`, Sentry.Severity.Error);
      });
    }
    restart(`its process ended (${details.reason})`);
  });

  // A hang that clears by itself is only noted. One that lasts HANG_LIMIT_MS
  // means the scheduler is stuck too: end the page's process and load the
  // page again, in a new process.
  win.on('unresponsive', () => {
    console.log(`[recovery] window unresponsive${restarting ? ' (page restarting, ignored)' : ''}`);
    if (hangTimer || restarting) {
      return;
    }
    Sentry.addBreadcrumb({ category: 'recovery', message: 'Window unresponsive' });
    hangTimer = setTimeout(() => {
      hangTimer = null;
      if (isQuitting() || win.isDestroyed()) {
        return;
      }
      console.log('[recovery] window still unresponsive after the hang limit');
      Sentry.captureMessage(
        `Window unresponsive for ${HANG_LIMIT_MS / 60000} minutes; restarting the page`,
        Sentry.Severity.Error
      );
      endingHungPage = true;
      // In case no 'render-process-gone' follows, so a later crash is not missed.
      setTimeout(() => (endingHungPage = false), 10 * 1000);
      page.forcefullyCrashRenderer();
      restart('a hang');
    }, HANG_LIMIT_MS);
  });
  win.on('responsive', () => {
    console.log('[recovery] window responsive');
    if (hangTimer) {
      clearHangTimer();
      Sentry.addBreadcrumb({ category: 'recovery', message: 'Window responsive again' });
    }
  });
}

/**
 * Reports crashes of the app's other processes. Chromium restarts the GPU and
 * utility processes by itself, so these are warnings, and the ones ended from
 * outside or while quitting are not reported. The main window's page is
 * watched by watchMainWindow.
 */
export function watchOtherProcesses(app: App, isQuitting: () => boolean): void {
  app.on('child-process-gone', (_event, details: Details) => {
    if (isQuitting() || endedFromOutside(details.reason)) {
      return;
    }
    Sentry.withScope((scope) => {
      scope.setTag('process', details.type);
      scope.setTag('reason', details.reason);
      scope.setExtra('exitCode', details.exitCode);
      Sentry.captureMessage(
        `Child process crashed: ${details.type} - ${details.reason}`,
        Sentry.Severity.Warning
      );
    });
  });

  app.on('render-process-gone', (_event, contents: WebContents, details: RenderProcessGoneDetails) => {
    if (watchedPages.has(contents) || isQuitting() || endedFromOutside(details.reason)) {
      return;
    }
    Sentry.withScope((scope) => {
      scope.setTag('reason', details.reason);
      Sentry.captureMessage(`Renderer process crashed: ${details.reason}`, Sentry.Severity.Warning);
    });
  });
}
