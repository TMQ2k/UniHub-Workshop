import { Type } from 'class-transformer';
import { IsArray, ValidateNested, ArrayMinSize } from 'class-validator';
import { SyncCheckInItemDto } from './sync-checkin.dto.js';

/**
 * Request body for POST /checkins/sync — batch offline check-in sync.
 */
export class BatchSyncCheckInDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SyncCheckInItemDto)
  checkins!: SyncCheckInItemDto[];
}
