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
  console.log({ schoolId });
  const school = JSON.parse(storage.get('schoolInfo')) as School;
  const response = await schoolService.getById(schoolId).toPromise();

  console.log(response);
  const schoolResponse = response.filter((x) => x.country === school.country);
  console.log({ schoolResponse });
  if (schoolResponse.length > 0) {
    settings.setSetting('scheduledTesting', true);
    storage.set('schoolInfo', JSON.stringify(response[0]));
    return true;
  } else {
    storage.set('schoolInfo', undefined);
    storage.set('schoolId', undefined);
    console.log('School not found');
    return false;
  }
};
