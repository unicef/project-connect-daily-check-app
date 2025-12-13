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
  // NEW: get the userId or browserId stored on the device
  /*const localUserId =
    storage.get('browser_id') ||
    storage.get('user_id');*/

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
  }

  //NEW: validate if there is a record with the same user_id

 /* const userMatch = response.some((entry: any) => {
    return entry.user_id === localUserId;
  });

  if (!userMatch) {
    storage.clear();
    console.log(
      'No matching user_id found for this gigaId → clearing local storage'
    );
    captureMessage('User_id mismatch → clearing local storage');
    return false;
  }*/

  // All good
  return true;
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
      storage.set('schoolId', schoolCorrectId);
      storage.set('gigaId', gigaCorrectId);
      console.log({ rigthGigaId: storage.get('gigaId') });
      storage.set('country_code', schools[0].code);
      storage.set('schoolInfo', JSON.stringify(schools[0]));
      return true;
    }
  }
  return false;
};
