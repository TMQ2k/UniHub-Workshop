import { IsOptional, IsInt, Min, Max, IsString, IsBooleanString } from 'class-validator';
import { Type } from 'class-transformer';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

export class QueryWorkshopDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = DEFAULT_PAGE;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_LIMIT)
  limit: number = DEFAULT_LIMIT;

  @IsOptional()
  @IsString()
  date?: string; // YYYY-MM-DD

  @IsOptional()
  @IsBooleanString()
  free?: string; // "true" | "false"

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  status?: string; // 'DRAFT' | 'PUBLISHED' | 'CANCELLED' | 'all'
}
