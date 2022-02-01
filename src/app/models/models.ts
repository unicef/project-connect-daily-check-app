export interface Country {
    id: number;
    code: string;
    name: string;
    flag: string;
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