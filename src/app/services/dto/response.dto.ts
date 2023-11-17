export interface ResponseDto<TDto> {
  success: boolean;
  timestamp: string;
  data: TDto[];
}
