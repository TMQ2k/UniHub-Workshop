import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Workshop } from './entities/workshop.entity.js';
import { WorkshopService } from './workshop.service.js';
import { WorkshopController } from './workshop.controller.js';

@Module({
  imports: [TypeOrmModule.forFeature([Workshop])],
  controllers: [WorkshopController],
  providers: [WorkshopService],
  exports: [WorkshopService, TypeOrmModule],
})
export class WorkshopModule {}
