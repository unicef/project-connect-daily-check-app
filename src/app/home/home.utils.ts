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
  const response = await schoolService
    .getBySchoolIdAndCountryCode(schoolId, countryCode)
    .toPromise();

  console.log(response);
  const schoolResponse = response.filter(
    (x) => (x as any).giga_id_school === gigaId
  );
  console.log({ schoolResponse });
  if (schoolResponse.length > 0) {
    settings.setSetting('scheduledTesting', true);
    storage.set('schoolInfo', JSON.stringify(schoolResponse[0]));
    return true;
  } else {
    storage.clear();
    console.log('School not found');
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
