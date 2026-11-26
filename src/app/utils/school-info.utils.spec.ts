import { parseSchoolInfo } from './school-info.utils';

describe('parseSchoolInfo', () => {
  it('reads the saved school', () => {
    expect(parseSchoolInfo('{"name":"School 1","country":"ES"}')).toEqual({
      name: 'School 1',
      country: 'ES',
    });
  });

  it('is null when nothing usable is saved', () => {
    for (const raw of [null, undefined, '', 'undefined', 'null', '{not json', '"a string"', '42']) {
      expect(parseSchoolInfo(raw)).withContext(String(raw)).toBeNull();
    }
  });
});
