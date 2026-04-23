import { IsUUID, IsNotEmpty } from 'class-validator';

export class CreateRegistrationDto {
  @IsUUID()
  @IsNotEmpty()
  workshopId!: string;
}
