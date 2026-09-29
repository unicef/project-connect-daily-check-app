import { FirebaseCrashlytics } from '@capacitor-firebase/crashlytics';
import { Capacitor } from '@capacitor/core';

export async function initCrashlytics() {
  // Enable crashlytics collection
  console.log(
    'GIGA Enable Chrashlytics for Native Android App',
    Capacitor.getPlatform() === 'android',
  );
  try {
    await FirebaseCrashlytics.setEnabled({ enabled: true });

    // Test log
    await FirebaseCrashlytics.log({ message: 'App started!' });
  } catch (err) {
    // Builds without a google-services.json have no FirebaseApp; skip Crashlytics.
    console.warn('GIGA Firebase not configured, Crashlytics disabled', err);
  }
  // Force test crash (for testing only!)

  //  testCrash();
}

async function testCrash() {
  try {
    // This will crash the app intentionally
    await FirebaseCrashlytics.crash({ message: 'Force crash test' });
  } catch (err) {
    console.error('Crash test failed', err);
  }
}
