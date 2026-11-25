/**
 * The school saved at registration (localStorage `schoolInfo`), or null when
 * none is saved or it can't be read.
 *
 * It is written with JSON.stringify(school), which stores the string
 * "undefined" when there was no school, and JSON.parse throws on that. After a
 * logout or deactivation it is gone altogether while pages that show it are
 * still on screen.
 */
export function parseSchoolInfo(raw: string | null | undefined): any | null {
  if (!raw || raw === 'undefined' || raw === 'null') {
    return null;
  }
  try {
    const school = JSON.parse(raw);
    return school && typeof school === 'object' ? school : null;
  } catch {
    return null;
  }
}
