import { IsUUID, IsNotEmpty, IsDateString } from 'class-validator';

/**
 * A single offline check-in payload sent from the mobile app.
 */
export class SyncCheckInItemDto {
  @IsUUID()
  @IsNotEmpty()
  registrationId!: string;

  @IsUUID()
  @IsNotEmpty()
  workshopId!: string;

  @IsDateString()
  @IsNotEmpty()
  scannedAt!: string;
}
