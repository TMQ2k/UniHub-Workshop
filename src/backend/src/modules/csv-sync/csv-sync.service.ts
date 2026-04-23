import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Cron } from '@nestjs/schedule';
import { Repository } from 'typeorm';
import { Queue } from 'bullmq';
import * as fs from 'fs';
import * as path from 'path';
import { CsvImportLog } from './entities/csv-import-log.entity.js';

const CSV_SYNC_QUEUE = 'csv-import';
const IMPORT_DIR = path.resolve(process.cwd(), '../../data');
const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024; // 100 MB

@Injectable()
export class CsvSyncService {
  private readonly logger = new Logger(CsvSyncService.name);

  constructor(
    @InjectRepository(CsvImportLog)
    private readonly logRepo: Repository<CsvImportLog>,
    @InjectQueue(CSV_SYNC_QUEUE)
    private readonly csvQueue: Queue,
  ) {}

  // ──────────────────────────────────────────────────────────
  // Cron: every 15 minutes
  // ──────────────────────────────────────────────────────────

  @Cron('*/15 * * * *')
  async handleCron(): Promise<void> {
    this.logger.log('⏰ CSV Sync cron triggered (every 15 min)');
    await this.scanAndEnqueue();
  }

  /**
   * Scan /data directory for sample-students.csv and enqueue import job.
   * In production this would look for dated files: students_{YYYYMMDD}.csv
   */
  async scanAndEnqueue(): Promise<{ jobId: string } | null> {
    const csvPath = path.join(IMPORT_DIR, 'sample-students.csv');

    if (!fs.existsSync(csvPath)) {
      this.logger.log('No CSV file found — skipping.');
      return null;
    }

    const stat = fs.statSync(csvPath);
    if (stat.size > MAX_FILE_SIZE_BYTES) {
      this.logger.error(`File too large: ${stat.size} bytes (max ${MAX_FILE_SIZE_BYTES})`);
      return null;
    }

    const filename = path.basename(csvPath);

    // Create log entry
    const log = this.logRepo.create({
      filename,
      status: 'QUEUED',
    });
    const saved = await this.logRepo.save(log);

    // Enqueue BullMQ job
    const job = await this.csvQueue.add(
      'import-csv',
      {
        logId: saved.id,
        filePath: csvPath,
        filename,
      },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5_000 },
        removeOnComplete: true,
      },
    );

    this.logger.log(`Enqueued CSV import job ${job.id} for file ${filename}`);
    return { jobId: saved.id };
  }

  /**
   * Manual trigger by ORGANIZER.
   */
  async triggerManualImport(): Promise<{ jobId: string; status: string; message: string }> {
    const result = await this.scanAndEnqueue();

    if (!result) {
      return {
        jobId: '',
        status: 'NO_FILE',
        message: 'Không tìm thấy file CSV mới.',
      };
    }

    return {
      jobId: result.jobId,
      status: 'QUEUED',
      message: 'Import job đã được thêm vào queue.',
    };
  }

  /**
   * Get all import logs.
   */
  async getLogs() {
    return this.logRepo.find({ order: { createdAt: 'DESC' } });
  }

  /**
   * Get detailed import log by ID.
   */
  async getLogById(id: string) {
    return this.logRepo.findOne({ where: { id } });
  }
}
