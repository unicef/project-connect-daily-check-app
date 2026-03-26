export interface ResponseDto<TDto> {
  success: boolean;
  timestamp: string;
  data: TDto[];
}

export interface GeocodeResponse {
    address: string;
    state: string;
    city: string;
    postalCode: string;
    subLocality: string;
    country: string;
    latitude: number;
    longitude: number;
}


