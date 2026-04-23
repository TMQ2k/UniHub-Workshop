import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { WorkshopService } from './workshop.service.js';
import { Workshop, WorkshopStatus } from './entities/workshop.entity.js';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';

describe('WorkshopService', () => {
  let service: WorkshopService;
  let repo: jest.Mocked<Repository<Workshop>>;

  const mockWorkshop: Workshop = {
    id: 'uuid-1',
    title: 'Test Workshop',
    description: 'Description',
    speaker: 'Speaker',
    room: 'A.101',
    roomMapUrl: null,
    startTime: new Date('2027-06-01T09:00:00Z'),
    endTime: new Date('2027-06-01T11:00:00Z'),
    maxSeats: 60,
    availableSeats: 60,
    price: 0,
    status: WorkshopStatus.DRAFT,
    createdBy: 'user-1',
    creator: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockQb = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getCount: jest.fn().mockResolvedValue(1),
    getMany: jest.fn().mockResolvedValue([mockWorkshop]),
    getOne: jest.fn().mockResolvedValue(null),
  } as unknown as jest.Mocked<SelectQueryBuilder<Workshop>>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkshopService,
        {
          provide: getRepositoryToken(Workshop),
          useValue: {
            create: jest.fn().mockImplementation((dto) => ({ ...mockWorkshop, ...dto })),
            save: jest.fn().mockImplementation((entity) => Promise.resolve({ ...mockWorkshop, ...entity })),
            findOne: jest.fn().mockResolvedValue(mockWorkshop),
            createQueryBuilder: jest.fn().mockReturnValue(mockQb),
          },
        },
      ],
    }).compile();

    service = module.get<WorkshopService>(WorkshopService);
    repo = module.get(getRepositoryToken(Workshop));
  });

  describe('create', () => {
    it('should create a workshop with DRAFT status', async () => {
      const dto = {
        title: 'New Workshop',
        startTime: '2027-06-01T09:00:00Z',
        endTime: '2027-06-01T11:00:00Z',
        maxSeats: 60,
        price: 0,
      };

      const result = await service.create(dto, 'user-1');

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          title: dto.title,
          status: WorkshopStatus.DRAFT,
          availableSeats: dto.maxSeats,
        }),
      );
      expect(repo.save).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should reject start time in the past', async () => {
      const dto = {
        title: 'Past Workshop',
        startTime: '2020-01-01T09:00:00Z',
        endTime: '2020-01-01T11:00:00Z',
        maxSeats: 60,
        price: 0,
      };

      await expect(service.create(dto, 'user-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reject end time before start time', async () => {
      const dto = {
        title: 'Invalid Workshop',
        startTime: '2027-06-01T11:00:00Z',
        endTime: '2027-06-01T09:00:00Z',
        maxSeats: 60,
        price: 0,
      };

      await expect(service.create(dto, 'user-1')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('update', () => {
    it('should reject update on cancelled workshop', async () => {
      repo.findOne = jest.fn().mockResolvedValue({
        ...mockWorkshop,
        status: WorkshopStatus.CANCELLED,
      });

      await expect(
        service.update('uuid-1', { title: 'Updated' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject maxSeats below current registrations', async () => {
      repo.findOne = jest.fn().mockResolvedValue({
        ...mockWorkshop,
        maxSeats: 60,
        availableSeats: 10, // 50 registered
      });

      await expect(
        service.update('uuid-1', { maxSeats: 30 }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('publish', () => {
    it('should set status to PUBLISHED', async () => {
      const result = await service.publish('uuid-1');
      expect(result.status).toBe(WorkshopStatus.PUBLISHED);
    });

    it('should reject publishing a cancelled workshop', async () => {
      repo.findOne = jest.fn().mockResolvedValue({
        ...mockWorkshop,
        status: WorkshopStatus.CANCELLED,
      });

      await expect(service.publish('uuid-1')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('cancel', () => {
    it('should set status to CANCELLED', async () => {
      const result = await service.cancel('uuid-1');
      expect(result.status).toBe(WorkshopStatus.CANCELLED);
    });
  });

  describe('findOne', () => {
    it('should return workshop by id', async () => {
      const result = await service.findOne('uuid-1');
      expect(result).toEqual(mockWorkshop);
    });

    it('should throw NotFoundException for non-existent id', async () => {
      repo.findOne = jest.fn().mockResolvedValue(null);

      await expect(service.findOne('non-existent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('findAll', () => {
    it('should return paginated results', async () => {
      const result = await service.findAll({ page: 1, limit: 20 });

      expect(result.data).toHaveLength(1);
      expect(result.meta.page).toBe(1);
      expect(result.meta.limit).toBe(20);
      expect(result.meta.total).toBe(1);
    });
  });
});
