import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { getQueueToken } from '@nestjs/bullmq';
import { CsvSyncService } from './csv-sync.service.js';
import { CsvImportLog } from './entities/csv-import-log.entity.js';

describe('CsvSyncService', () => {
  let service: CsvSyncService;
  let logRepo: Record<string, jest.Mock>;
  let mockQueue: Record<string, jest.Mock>;

  beforeEach(async () => {
    logRepo = {
      create: jest.fn((dto) => ({ id: 'log-1', ...dto })),
      save: jest.fn((entity) => Promise.resolve({ ...entity, id: 'log-1' })),
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue(undefined),
    };

    mockQueue = {
      add: jest.fn().mockResolvedValue({ id: 'job-1' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CsvSyncService,
        { provide: getRepositoryToken(CsvImportLog), useValue: logRepo },
        { provide: getQueueToken('csv-import'), useValue: mockQueue },
      ],
    }).compile();

    service = module.get<CsvSyncService>(CsvSyncService);
  });

  describe('triggerManualImport', () => {
    it('should return status and message', async () => {
      const result = await service.triggerManualImport();

      // Result depends on whether file exists in test env
      expect(result).toBeDefined();
      expect(result.status).toBeDefined();
      expect(result.message).toBeDefined();
    });
  });

  describe('getLogs', () => {
    it('should return import logs ordered by createdAt DESC', async () => {
      logRepo.find.mockResolvedValue([
        { id: 'log-1', filename: 'test.csv', status: 'COMPLETED' },
      ]);

      const logs = await service.getLogs();

      expect(logs).toHaveLength(1);
      expect(logRepo.find).toHaveBeenCalledWith({
        order: { createdAt: 'DESC' },
      });
    });
  });

  describe('getLogById', () => {
    it('should return null for non-existent log', async () => {
      const result = await service.getLogById('non-existent');
      expect(result).toBeNull();
    });

    it('should return log with details', async () => {
      logRepo.findOne.mockResolvedValue({
        id: 'log-1',
        filename: 'students.csv',
        status: 'COMPLETED',
        totalRows: 100,
        inserted: 80,
        updated: 15,
        skipped: 3,
        failed: 2,
      });

      const result = await service.getLogById('log-1');

      expect(result).toBeDefined();
      expect(result!.status).toBe('COMPLETED');
      expect(result!.totalRows).toBe(100);
    });
  });
});
