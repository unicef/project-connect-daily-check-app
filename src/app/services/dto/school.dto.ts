/* eslint-disable @typescript-eslint/naming-convention */
export interface WrongGigaIdSchool {
  correct_giga_id: string;
  wrong_giga_id: string;
  correct_school_id: string;
  correct_school_name: string;
}
export interface SchoolRegistration {
  school_id: string;
  school_name: string;
  latitude: number;
  longitude: number;
  country_iso3_code: string;  
  address: {
    address: string;
    city: string;
    state: string;
    postalCode: string;
    [key: string]: any;
  };
  education_level: string;
  contact_name: string;
  contact_email: string;
}
