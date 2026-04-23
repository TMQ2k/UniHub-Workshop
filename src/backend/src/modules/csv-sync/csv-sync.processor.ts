import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Job } from 'bullmq';
import * as fs from 'fs';
import { parse } from 'csv-parse';
import { CsvImportLog } from './entities/csv-import-log.entity.js';
import { User, UserRole } from '../auth/entities/user.entity.js';
import { AuthService } from '../auth/auth.service.js';

interface CsvJobData {
  logId: string;
  filePath: string;
  filename: string;
}

interface CsvRow {
  student_id?: string;
  full_name?: string;
  email?: string;
  faculty?: string;
  enrollment_year?: string;
}

interface RowError {
  [key: string]: unknown;
  row: number;
  studentId: string | null;
  reason: string;
  rawData: string;
}

const REQUIRED_HEADERS = ['student_id', 'full_name', 'email'];
const BATCH_SIZE = 100;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * BullMQ worker that processes CSV import jobs in the background.
 * - Validates header format
 * - Parses rows, skipping invalid ones without aborting
 * - Upserts students in batches of 100
 * - Logs results (total, inserted, updated, skipped, failed)
 */
@Processor('csv-import')
export class CsvSyncProcessor extends WorkerHost {
  private readonly logger = new Logger(CsvSyncProcessor.name);

  constructor(
    @InjectRepository(CsvImportLog)
    private readonly logRepo: Repository<CsvImportLog>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly dataSource: DataSource,
  ) {
    super();
  }

  async process(job: Job<CsvJobData>): Promise<void> {
    const { logId, filePath, filename } = job.data;

    this.logger.log(`Starting CSV import: ${filename}`);

    // Mark as PROCESSING
    await this.updateLog(logId, {
      status: 'PROCESSING',
      startedAt: new Date(),
    });

    const summary = {
      totalRows: 0,
      inserted: 0,
      updated: 0,
      skipped: 0,
      failed: 0,
    };
    const errors: RowError[] = [];

    try {
      // Parse CSV
      const rows = await this.parseCSV(filePath);

      // Validate headers (already done by csv-parse columns option, but double check)
      if (rows.length === 0) {
        this.logger.warn(`Empty CSV file: ${filename}`);
        await this.updateLog(logId, {
          status: 'COMPLETED',
          completedAt: new Date(),
          totalRows: 0,
          errors: [{ row: 0, studentId: null, reason: 'EMPTY_CSV', rawData: '' }],
        });
        return;
      }

      summary.totalRows = rows.length;

      // Process in batches
      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const batch = rows.slice(i, i + BATCH_SIZE);
        await this.processBatch(batch, i + 1, summary, errors);
      }

      // Update log with final results
      await this.updateLog(logId, {
        status: 'COMPLETED',
        completedAt: new Date(),
        totalRows: summary.totalRows,
        inserted: summary.inserted,
        updated: summary.updated,
        skipped: summary.skipped,
        failed: summary.failed,
        errors: errors.length > 0 ? errors : null,
      });

      this.logger.log(
        `CSV import completed: ${filename} — ` +
        `total=${summary.totalRows}, inserted=${summary.inserted}, ` +
        `updated=${summary.updated}, skipped=${summary.skipped}, failed=${summary.failed}`,
      );
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`CSV import failed: ${msg}`);

      await this.updateLog(logId, {
        status: 'FAILED',
        completedAt: new Date(),
        ...summary,
        errors: [{ row: 0, studentId: null, reason: msg, rawData: '' }, ...errors],
      });

      throw error; // BullMQ will retry
    }
  }

  /**
   * Helper to update import log without TypeORM strict-typing issues on JSONB fields.
   */
  private async updateLog(
    logId: string,
    data: Partial<Pick<CsvImportLog, 'status' | 'startedAt' | 'completedAt' | 'totalRows' | 'inserted' | 'updated' | 'skipped' | 'failed' | 'errors'>>,
  ): Promise<void> {
    const log = await this.logRepo.findOne({ where: { id: logId } });
    if (!log) return;
    Object.assign(log, data);
    await this.logRepo.save(log);
  }

  // ──────────────────────────────────────────────────────────

  private parseCSV(filePath: string): Promise<CsvRow[]> {
    return new Promise((resolve, reject) => {
      const rows: CsvRow[] = [];

      const stream = fs.createReadStream(filePath).pipe(
        parse({
          columns: true,        // Use first row as headers
          skip_empty_lines: true,
          trim: true,
          relax_column_count: true,
        }),
      );

      let headerValidated = false;

      stream.on('data', (row: CsvRow) => {
        if (!headerValidated) {
          // Validate required headers exist
          const headers = Object.keys(row);
          const missing = REQUIRED_HEADERS.filter(
            (h) => !headers.includes(h),
          );
          if (missing.length > 0) {
            stream.destroy(
              new Error(`INVALID_CSV_HEADER: missing columns: ${missing.join(', ')}`),
            );
            return;
          }
          headerValidated = true;
        }
        rows.push(row);
      });

      stream.on('end', () => resolve(rows));
      stream.on('error', (err) => reject(err));
    });
  }

  private async processBatch(
    batch: CsvRow[],
    startRowNum: number,
    summary: { inserted: number; updated: number; skipped: number; failed: number },
    errors: RowError[],
  ): Promise<void> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      for (let i = 0; i < batch.length; i++) {
        const row = batch[i]!;
        const rowNum = startRowNum + i;

        try {
          this.validateRow(row, rowNum, errors);

          // If row was added to errors by validateRow, it was skipped
          if (errors.length > 0 && errors[errors.length - 1]?.row === rowNum) {
            summary.skipped++;
            continue;
          }

          // Upsert by student_id
          const existing = await queryRunner.manager.findOne(User, {
            where: { studentId: row.student_id },
          });

          if (existing) {
            // UPDATE
            await queryRunner.manager.update(User, existing.id, {
              fullName: row.full_name!,
              email: row.email!,
              faculty: row.faculty ?? existing.faculty,
              enrollmentYear: row.enrollment_year
                ? parseInt(row.enrollment_year, 10)
                : existing.enrollmentYear,
            });
            summary.updated++;
          } else {
            // INSERT — new student with default password
            const defaultPassword = `${row.student_id}UniHub2026`;
            const passwordHash = await AuthService.hashPassword(defaultPassword);

            const newUser = queryRunner.manager.create(User, {
              studentId: row.student_id!,
              fullName: row.full_name!,
              email: row.email!,
              passwordHash,
              role: UserRole.STUDENT,
              faculty: row.faculty ?? null,
              enrollmentYear: row.enrollment_year
                ? parseInt(row.enrollment_year, 10)
                : null,
            });

            await queryRunner.manager.save(newUser);
            summary.inserted++;
          }
        } catch (rowError) {
          const msg = rowError instanceof Error ? rowError.message : String(rowError);
          this.logger.warn(`Row ${rowNum} failed: ${msg}`);
          errors.push({
            row: rowNum,
            studentId: row.student_id ?? null,
            reason: msg,
            rawData: JSON.stringify(row),
          });
          summary.failed++;
          // Skip this row, continue with rest of batch
        }
      }

      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  private validateRow(row: CsvRow, rowNum: number, errors: RowError[]): void {
    if (!row.student_id || row.student_id.trim() === '') {
      errors.push({
        row: rowNum,
        studentId: null,
        reason: 'MISSING_STUDENT_ID',
        rawData: JSON.stringify(row),
      });
      return;
    }

    if (!row.full_name || row.full_name.trim() === '') {
      errors.push({
        row: rowNum,
        studentId: row.student_id,
        reason: 'MISSING_FULL_NAME',
        rawData: JSON.stringify(row),
      });
      return;
    }

    if (!row.email || !EMAIL_REGEX.test(row.email)) {
      errors.push({
        row: rowNum,
        studentId: row.student_id,
        reason: 'INVALID_EMAIL',
        rawData: JSON.stringify(row),
      });
      return;
    }
  }
}
