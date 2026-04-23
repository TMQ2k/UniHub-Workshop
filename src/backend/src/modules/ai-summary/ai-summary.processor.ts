import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { AiSummaryService } from './ai-summary.service.js';
import { PdfParserService } from './services/pdf-parser.service.js';
import { AiService } from './services/ai.service.js';

interface ProcessPdfJobData {
  summaryId: string;
  workshopId: string;
  pdfPath: string;
}

/**
 * AiSummaryProcessor — BullMQ worker for async PDF→AI pipeline.
 *
 * SRP: This processor only orchestrates the pipeline steps:
 * 1. PdfParserService extracts text
 * 2. AiService generates summary
 * 3. AiSummaryService persists the result
 */
@Processor('ai-summary')
export class AiSummaryProcessor extends WorkerHost {
  private readonly logger = new Logger(AiSummaryProcessor.name);

  constructor(
    private readonly aiSummaryService: AiSummaryService,
    private readonly pdfParser: PdfParserService,
    private readonly aiService: AiService,
  ) {
    super();
  }

  async process(job: Job<ProcessPdfJobData>): Promise<void> {
    const { summaryId, workshopId, pdfPath } = job.data;
    this.logger.log(
      `Processing AI summary job ${job.id} for workshop ${workshopId}`,
    );

    try {
      // Step 1: Extract text from PDF (PdfParserService)
      const textContent = await this.pdfParser.extractText(pdfPath);

      // Step 2: Generate summary via AI (AiService)
      const summary = await this.aiService.generateSummary(textContent);

      // Step 3: Persist result (AiSummaryService)
      await this.aiSummaryService.markCompleted(summaryId, summary);

      this.logger.log(
        `AI summary job ${job.id} completed for workshop ${workshopId}`,
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        `AI summary job ${job.id} failed: ${errorMessage}`,
      );

      // Mark as FAILED only on final attempt
      if (job.attemptsMade >= (job.opts.attempts ?? 3) - 1) {
        await this.aiSummaryService.markFailed(summaryId);
      }

      // Re-throw so BullMQ handles retry
      throw error;
    }
  }
}
