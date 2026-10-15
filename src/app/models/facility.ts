/**
 * Facility registry — single source of truth for every facility-type branch
 * decision (selection screen, lookup, registration, copy).
 *
 * Adding a new facility type should be one entry here (plus i18n copy and
 * backend support), not scattered `if` statements.
 *
 * This static list is the client's superset; the backend narrows it per
 * country, through the supported facility types it reports back.
 */
export type FacilityType = 'school' | 'health';

/** Legacy installs predate facility types; they can only be schools. */
export const DEFAULT_FACILITY_TYPE: FacilityType = 'school';

export interface FacilityTypeConfig {
  type: FacilityType;
  /** i18n key for the selection card label. */
  labelKey: string;
  /** ionicon name (or asset path) for the selection card. */
  icon: string;
  /** Giga ID field this type uses on API payloads. */
  gigaIdField: 'giga_id_school' | 'giga_id_health';
  /** i18n key for the lookup input label ("School ID" vs "Government ID"). */
  lookupIdLabelKey: string;
  /** Route to show when lookup finds nothing. */
  notFoundRoute: string;
}

export const FACILITY_TYPES: FacilityTypeConfig[] = [
  {
    type: 'school',
    labelKey: 'facilityType.school',
    icon: 'school-outline',
    gigaIdField: 'giga_id_school',
    lookupIdLabelKey: 'idLabel.school',
    notFoundRoute: 'schoolnotfound',
  },
  {
    type: 'health',
    labelKey: 'facilityType.health',
    icon: 'medkit-outline',
    gigaIdField: 'giga_id_health',
    lookupIdLabelKey: 'idLabel.health',
    notFoundRoute: 'schoolnotfound',
  },
];

export function getFacilityConfig(type: FacilityType): FacilityTypeConfig {
  return (
    FACILITY_TYPES.find((c) => c.type === type) ??
    FACILITY_TYPES.find((c) => c.type === DEFAULT_FACILITY_TYPE)
  );
}
