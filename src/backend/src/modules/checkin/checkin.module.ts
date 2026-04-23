import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CheckIn } from './entities/checkin.entity.js';
import { Registration } from '../registration/entities/registration.entity.js';
import { CheckinService } from './checkin.service.js';
import { CheckinController } from './checkin.controller.js';

@Module({
  imports: [TypeOrmModule.forFeature([CheckIn, Registration])],
  controllers: [CheckinController],
  providers: [CheckinService],
  exports: [CheckinService],
})
export class CheckinModule {}
