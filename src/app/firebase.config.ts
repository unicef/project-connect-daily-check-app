import { FirebaseCrashlytics } from '@capacitor-firebase/crashlytics';
import { Capacitor } from '@capacitor/core';

export async function initCrashlytics() {
  // Enable crashlytics collection
  console.log(
    'GIGA Enable Chrashlytics for Native Android App',
    Capacitor.getPlatform() === 'android',
  );
  await FirebaseCrashlytics.setEnabled({ enabled: true });

  // Test log
  await FirebaseCrashlytics.log({ message: 'App started!' });
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
