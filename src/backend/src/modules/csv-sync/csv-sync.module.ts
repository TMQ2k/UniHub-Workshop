import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { ScheduleModule } from '@nestjs/schedule';
import { CsvImportLog } from './entities/csv-import-log.entity.js';
import { CsvSyncService } from './csv-sync.service.js';
import { CsvSyncController } from './csv-sync.controller.js';
import { CsvSyncProcessor } from './csv-sync.processor.js';
import { AuthModule } from '../auth/auth.module.js';
import { User } from '../auth/entities/user.entity.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([CsvImportLog, User]),
    BullModule.registerQueue({ name: 'csv-import' }),
    ScheduleModule.forRoot(),
    AuthModule,
  ],
  controllers: [CsvSyncController],
  providers: [CsvSyncService, CsvSyncProcessor],
  exports: [CsvSyncService],
})
export class CsvSyncModule {}
