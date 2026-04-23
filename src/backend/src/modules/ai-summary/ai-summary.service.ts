import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Repository } from 'typeorm';
import { Queue } from 'bullmq';
import { AiSummary, AiSummaryStatus } from './entities/ai-summary.entity.js';
import { Workshop } from '../workshop/entities/workshop.entity.js';

const AI_SUMMARY_QUEUE = 'ai-summary';
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

/**
 * AiSummaryService — orchestrates the AI summary workflow.
 *
 * SRP: This service only handles workflow orchestration:
 * - Validate upload, persist records, enqueue jobs, query status.
 * - Does NOT parse PDFs (PdfParserService handles that).
 * - Does NOT call AI APIs (AiService handles that).
 */
@Injectable()
export class AiSummaryService {
  private readonly logger = new Logger(AiSummaryService.name);

  constructor(
    @InjectRepository(AiSummary)
    private readonly aiSummaryRepo: Repository<AiSummary>,
    @InjectRepository(Workshop)
    private readonly workshopRepo: Repository<Workshop>,
    @InjectQueue(AI_SUMMARY_QUEUE)
    private readonly aiSummaryQueue: Queue,
  ) {}

  /**
   * Handle PDF upload: validate, persist record, enqueue processing job.
   * Returns 202 Accepted — processing is asynchronous.
   */
  async uploadPdf(
    workshopId: string,
    file: Express.Multer.File,
  ) {
    // Validate workshop exists
    const workshop = await this.workshopRepo.findOne({
      where: { id: workshopId },
    });
    if (!workshop) {
      throw new NotFoundException({
        success: false,
        error: {
          code: 'WORKSHOP_NOT_FOUND',
          message: 'Workshop không tồn tại.',
        },
      });
    }

    // Validate file type
    if (file.mimetype !== 'application/pdf') {
      throw new BadRequestException({
        success: false,
        error: {
          code: 'INVALID_FILE_TYPE',
          message: 'Chỉ chấp nhận file PDF.',
        },
      });
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE_BYTES) {
      throw new BadRequestException({
        success: false,
        error: {
          code: 'FILE_TOO_LARGE',
          message: 'File vượt quá kích thước tối đa 10MB.',
        },
      });
    }

    // Delete old summary if regenerating
    await this.aiSummaryRepo.delete({ workshopId });

    // Create new PROCESSING record
    const record = this.aiSummaryRepo.create({
      workshopId,
      pdfPath: file.path,
      status: AiSummaryStatus.PROCESSING,
    });
    const saved = await this.aiSummaryRepo.save(record);

    // Enqueue async job
    await this.aiSummaryQueue.add(
      'process-pdf',
      {
        summaryId: saved.id,
        workshopId,
        pdfPath: file.path,
      },
      {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
        removeOnComplete: true,
        removeOnFail: false,
      },
    );

    this.logger.log(
      `PDF uploaded for workshop ${workshopId}, enqueued job ${saved.id}`,
    );

    return {
      workshopId,
      aiSummaryStatus: AiSummaryStatus.PROCESSING,
      message: 'PDF đang được xử lý. Tóm tắt sẽ sẵn sàng trong vài phút.',
    };
  }

  /**
   * Get the current AI summary for a workshop.
   */
  async getSummary(workshopId: string) {
    // Validate workshop exists
    const workshop = await this.workshopRepo.findOne({
      where: { id: workshopId },
    });
    if (!workshop) {
      throw new NotFoundException({
        success: false,
        error: {
          code: 'WORKSHOP_NOT_FOUND',
          message: 'Workshop không tồn tại.',
        },
      });
    }

    const record = await this.aiSummaryRepo.findOne({
      where: { workshopId },
      order: { createdAt: 'DESC' },
    });

    if (!record) {
      return {
        workshopId,
        status: null,
        summary: null,
      };
    }

    return {
      workshopId,
      summary: record.summary,
      status: record.status,
      generatedAt: record.generatedAt?.toISOString() ?? null,
    };
  }

  /**
   * Mark a summary as COMPLETED with the generated text.
   * Called by the queue processor.
   */
  async markCompleted(summaryId: string, summaryText: string): Promise<void> {
    await this.aiSummaryRepo.update(summaryId, {
      summary: summaryText,
      status: AiSummaryStatus.COMPLETED,
      generatedAt: new Date(),
    });
    this.logger.log(`AI summary ${summaryId} marked as COMPLETED`);
  }

  /**
   * Mark a summary as FAILED.
   * Called by the queue processor on unrecoverable errors.
   */
  async markFailed(summaryId: string): Promise<void> {
    await this.aiSummaryRepo.update(summaryId, {
      status: AiSummaryStatus.FAILED,
    });
    this.logger.warn(`AI summary ${summaryId} marked as FAILED`);
  }
}
