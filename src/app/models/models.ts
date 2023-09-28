export interface Country {
    id: number;
    code: string;
    name: string;
    flag: string;
}

export interface PcdcCountry {
    id: number;
    code: string;
    name: string;
    created: string;
    country_id: string;
}

export interface School {
    id: number;
    code: string;
    name: string;
    country_id: number;
    country: string;
    location_id?: number;
    address?: string;
    email?: string;
    postal_code?: string;
    education_level?: string;
    environment?: string;
    admin_1_name?: string;
    admin_2_name?: string;
    admin_3_name?: string;
    admin_4_name?: string;
    giga_id?: string;
}

export interface mlabInformation {
    city: string;
    url: string;
    ip: any[];
    fqdn: string;
    site: string;
    country: string;
    label: string;
    metro: string;
}

export interface accessInformation {
    ip: string;
    city: string;
    region: string;
    country: string;
    label: string;
    metro: string;
    site: string;
    url: string;
    fqdn: string;
    loc: string;
    org: string;
    postal: string;
    timezone: string;
    asn: string;
}