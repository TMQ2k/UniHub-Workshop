import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { getQueueToken } from '@nestjs/bullmq';
import { Repository } from 'typeorm';
import { AiSummaryService } from './ai-summary.service.js';
import { AiSummary, AiSummaryStatus } from './entities/ai-summary.entity.js';
import { Workshop } from '../workshop/entities/workshop.entity.js';
import { BadRequestException, NotFoundException } from '@nestjs/common';

describe('AiSummaryService', () => {
  let service: AiSummaryService;
  let aiSummaryRepo: jest.Mocked<Repository<AiSummary>>;
  let workshopRepo: jest.Mocked<Repository<Workshop>>;

  const mockQueue = {
    add: jest.fn().mockResolvedValue({ id: 'job-1' }),
  };

  const mockWorkshop = {
    id: 'workshop-1',
    title: 'Test Workshop',
  };

  const mockSummary: AiSummary = {
    id: 'summary-1',
    workshopId: 'workshop-1',
    pdfPath: '/uploads/test.pdf',
    summary: 'Tóm tắt nội dung workshop...',
    status: AiSummaryStatus.COMPLETED,
    generatedAt: new Date(),
    createdAt: new Date(),
    workshop: null as any,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiSummaryService,
        {
          provide: getRepositoryToken(AiSummary),
          useValue: {
            create: jest.fn().mockImplementation((dto) => ({ ...mockSummary, ...dto })),
            save: jest.fn().mockImplementation((entity) => Promise.resolve({ ...mockSummary, ...entity })),
            findOne: jest.fn().mockResolvedValue(mockSummary),
            delete: jest.fn().mockResolvedValue({ affected: 1 }),
            update: jest.fn().mockResolvedValue({ affected: 1 }),
          },
        },
        {
          provide: getRepositoryToken(Workshop),
          useValue: {
            findOne: jest.fn().mockResolvedValue(mockWorkshop),
          },
        },
        {
          provide: getQueueToken('ai-summary'),
          useValue: mockQueue,
        },
      ],
    }).compile();

    service = module.get<AiSummaryService>(AiSummaryService);
    aiSummaryRepo = module.get(getRepositoryToken(AiSummary));
    workshopRepo = module.get(getRepositoryToken(Workshop));
  });

  describe('uploadPdf', () => {
    const mockFile = {
      mimetype: 'application/pdf',
      size: 1024 * 1024, // 1MB
      path: '/uploads/test.pdf',
      originalname: 'test.pdf',
    } as Express.Multer.File;

    it('should accept valid PDF and enqueue job', async () => {
      const result = await service.uploadPdf('workshop-1', mockFile);

      expect(result.aiSummaryStatus).toBe(AiSummaryStatus.PROCESSING);
      expect(aiSummaryRepo.delete).toHaveBeenCalledWith({ workshopId: 'workshop-1' });
      expect(aiSummaryRepo.save).toHaveBeenCalled();
      expect(mockQueue.add).toHaveBeenCalledWith(
        'process-pdf',
        expect.objectContaining({ workshopId: 'workshop-1' }),
        expect.any(Object),
      );
    });

    it('should reject non-PDF file', async () => {
      const invalidFile = { ...mockFile, mimetype: 'image/png' } as Express.Multer.File;

      await expect(
        service.uploadPdf('workshop-1', invalidFile),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject file larger than 10MB', async () => {
      const largeFile = {
        ...mockFile,
        size: 11 * 1024 * 1024,
      } as Express.Multer.File;

      await expect(
        service.uploadPdf('workshop-1', largeFile),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException for non-existent workshop', async () => {
      workshopRepo.findOne = jest.fn().mockResolvedValue(null);

      await expect(
        service.uploadPdf('non-existent', mockFile),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getSummary', () => {
    it('should return completed summary', async () => {
      const result = await service.getSummary('workshop-1');

      expect(result.workshopId).toBe('workshop-1');
      expect(result.summary).toBe(mockSummary.summary);
      expect(result.status).toBe(AiSummaryStatus.COMPLETED);
    });

    it('should return null status when no summary exists', async () => {
      aiSummaryRepo.findOne = jest.fn().mockResolvedValue(null);

      const result = await service.getSummary('workshop-1');

      expect(result.status).toBeNull();
      expect(result.summary).toBeNull();
    });

    it('should throw NotFoundException for non-existent workshop', async () => {
      workshopRepo.findOne = jest.fn().mockResolvedValue(null);

      await expect(service.getSummary('non-existent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('markCompleted', () => {
    it('should update summary with COMPLETED status', async () => {
      await service.markCompleted('summary-1', 'Tóm tắt...');

      expect(aiSummaryRepo.update).toHaveBeenCalledWith(
        'summary-1',
        expect.objectContaining({
          summary: 'Tóm tắt...',
          status: AiSummaryStatus.COMPLETED,
        }),
      );
    });
  });

  describe('markFailed', () => {
    it('should update summary with FAILED status', async () => {
      await service.markFailed('summary-1');

      expect(aiSummaryRepo.update).toHaveBeenCalledWith(
        'summary-1',
        expect.objectContaining({ status: AiSummaryStatus.FAILED }),
      );
    });
  });
});
