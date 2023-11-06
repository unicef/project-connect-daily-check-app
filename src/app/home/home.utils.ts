import { ResponseDto } from '../services/dto/response.dto';
import { WrongGigaIdSchool } from '../services/dto/school.dto';
import { SchoolService } from '../services/school.service';
import { StorageService } from '../services/storage.service';
import { timedFunction } from '../utils/timedFunction.utils';

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
  const checkRight = await timedFunction(
    2000,
    schoolService.checkRightGigaId(gigaId),
    undefined
  );
  if (!checkRight) {
    return false;
  }

  const res = checkRight as unknown as ResponseDto<WrongGigaIdSchool>;
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
