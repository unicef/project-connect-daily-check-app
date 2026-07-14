import { captureMessage } from '@sentry/browser';
import { School } from '../models/models';
import { SchoolService } from '../services/school.service';
import { SettingsService } from '../services/settings.service';
import { StorageService } from '../services/storage.service';

export const removeUnregisterSchool = async (
  schoolId: number,
  schoolService: SchoolService,
  storage: StorageService,
  settings: SettingsService
) => {
  const gigaId = storage.get('gigaId');
  const countryCode = storage.get('country_code');
  let response;

  try {
    response = await schoolService
      .getRegisteredSchoolByGigaId(gigaId)
      .toPromise();
  } catch (e) {
    captureMessage('Error getting registered school by gigaId, ' + e);
    console.log('Error getting registered school by gigaId', e);
  }

  console.log({ response });

  if (response && Array.isArray(response) && response.length === 0) {
    storage.clear();
    console.log('Existing school on the device not found on backend');
    captureMessage('Existing school on the device not found on backend');
    return false;
  } else {
    return true;
  }
};

export const checkUnverifiedSchool = async (
  schoolId: number,
  schoolService: SchoolService,
  storage: StorageService,
  settings: SettingsService
) => {
  const gigaId = storage.get('gigaId');
  const countryCode = storage.get('country_code');
  let response;

  try {
    response = await schoolService
      .getRegisteredSchoolByGigaId(gigaId)
      .toPromise();
  } catch (e) {
    captureMessage('Error getting registered school by gigaId, ' + e);
    console.log('Error getting registered school by gigaId', e);
  }

  console.log({ response });

  if (response && Array.isArray(response) && response.length>0) {
    if (response[0].is_verified === false) {
      console.log('Existing school on the device not found on backend');
      captureMessage('Existing school on the device not found on backend');
      return false;
    }
    return true;
  } else {
    return false;
  }
};

/**
 *  This function takes the gigaId checks if is
 * correct and if is not substitute the localstorage values
 *
 * @param gigaId
 * @param schoolService
 * @param storage
 * @returns
 */
export const checkRightGigaId = async (
  gigaId: number,
  schoolService: SchoolService,
  storage: StorageService
) => {
  const checkRight = await schoolService.checkRightGigaId(gigaId).toPromise();

  if (checkRight.data.length === 0) {
    return false;
  }
  const res = checkRight;
  console.log({ checkRightGigaId: res });
  if (res && res.success) {
    const gigaCorrectId = res.data[0].correct_giga_id;
    const schoolCorrectId = res.data[0].correct_school_id;
    const schoolData = await schoolService
      .getById(parseInt(schoolCorrectId, 10))
      .toPromise();

    const schools = schoolData.filter(
      (s) => (s as any).giga_id_school === gigaCorrectId
    );
    if (schools.length > 0) {
      console.log({ schools });
      await storage.set('schoolId', schoolCorrectId);
      await storage.set('gigaId', gigaCorrectId);
      console.log({ rigthGigaId: storage.get('gigaId') });
      await storage.set('country_code', schools[0].code);
      await storage.set('schoolInfo', JSON.stringify(schools[0]));
      return true;
    }
  }
  return false;
};
