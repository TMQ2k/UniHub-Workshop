import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule } from '@nestjs/config';
import { AiSummary } from './entities/ai-summary.entity.js';
import { Workshop } from '../workshop/entities/workshop.entity.js';
import { AiSummaryService } from './ai-summary.service.js';
import { AiSummaryController } from './ai-summary.controller.js';
import { AiSummaryProcessor } from './ai-summary.processor.js';
import { PdfParserService } from './services/pdf-parser.service.js';
import { AiService } from './services/ai.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([AiSummary, Workshop]),
    BullModule.registerQueue({
      name: 'ai-summary',
    }),
    ConfigModule,
  ],
  controllers: [AiSummaryController],
  providers: [
    AiSummaryService,
    AiSummaryProcessor,
    // SRP: Dedicated, independent services
    PdfParserService,
    AiService,
  ],
  exports: [AiSummaryService],
})
export class AiSummaryModule {}

