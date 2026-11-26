/**
 * What a registration that failed could leave in local storage: up to 2.0.4
 * the answer to the flagged-school report (sent when the selected country
 * differs from the detected one) saved schoolId, whether or not the
 * registration went through.
 */
const LEFT_BY_FAILED_REGISTRATION = [
  'schoolId',
  'schoolInfo',
  'detectedCountry',
  'selectedCountry',
];

/**
 * Forgets a registration that never completed, so the app starts as not
 * registered instead of opening blank. True when it did.
 *
 * Every registration, by hand or automatic, in every release, saves
 * schoolUserId or gigaId with schoolId (the automatic one each only when the
 * backend sends it, and schoolInfo the same way), so a schoolId with neither
 * was left by one that failed. The rest is kept: settings, the hardware ID,
 * the app instance ID (a retry sends it again and gets back a registration
 * that did reach the server), the measurement history.
 */
export function forgetUnfinishedRegistration(
  storage: Storage = localStorage
): boolean {
  try {
    if (
      !storage.getItem('schoolId') ||
      storage.getItem('schoolUserId') ||
      storage.getItem('gigaId')
    ) {
      return false;
    }
    LEFT_BY_FAILED_REGISTRATION.forEach((key) => storage.removeItem(key));
    return true;
  } catch (error) {
    // The app has to start even if storage can't be read.
    console.warn('Could not check for an unfinished registration:', error);
    return false;
  }
}
