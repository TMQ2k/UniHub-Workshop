import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Registration } from './entities/registration.entity.js';
import { Workshop } from '../workshop/entities/workshop.entity.js';
import { User } from '../auth/entities/user.entity.js';
import { RegistrationService } from './registration.service.js';
import { RegistrationController } from './registration.controller.js';
import { NotificationModule } from '../notification/notification.module.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([Registration, Workshop, User]),
    NotificationModule,
  ],
  controllers: [RegistrationController],
  providers: [RegistrationService],
  exports: [RegistrationService],
})
export class RegistrationModule {}
