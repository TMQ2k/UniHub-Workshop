import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Workshop, WorkshopStatus } from './entities/workshop.entity.js';
import { CreateWorkshopDto, UpdateWorkshopDto, QueryWorkshopDto } from './dto/index.js';

@Injectable()
export class WorkshopService {
  private readonly logger = new Logger(WorkshopService.name);

  constructor(
    @InjectRepository(Workshop)
    private readonly workshopRepo: Repository<Workshop>,
  ) {}

  // ──────────────────────────────────────────────────────────
  // Create workshop (ORGANIZER)
  // ──────────────────────────────────────────────────────────

  async create(dto: CreateWorkshopDto, userId: string): Promise<Workshop> {
    this.validateSchedule(dto.startTime, dto.endTime);
    await this.checkRoomConflict(dto.room, dto.startTime, dto.endTime);

    const workshop = this.workshopRepo.create({
      title: dto.title,
      description: dto.description,
      speaker: dto.speaker,
      room: dto.room,
      roomMapUrl: dto.roomMapUrl,
      startTime: new Date(dto.startTime),
      endTime: new Date(dto.endTime),
      maxSeats: dto.maxSeats,
      availableSeats: dto.maxSeats, // Initially all seats available
      price: dto.price,
      status: WorkshopStatus.DRAFT,
      createdBy: userId,
    });

    const saved = await this.workshopRepo.save(workshop);
    this.logger.log(`Workshop "${saved.title}" created by user ${userId}`);
    return saved;
  }

  // ──────────────────────────────────────────────────────────
  // Update workshop (ORGANIZER)
  // ──────────────────────────────────────────────────────────

  async update(id: string, dto: UpdateWorkshopDto): Promise<Workshop> {
    const workshop = await this.findOneOrFail(id);

    if (workshop.status === WorkshopStatus.CANCELLED) {
      throw new BadRequestException({
        success: false,
        error: {
          code: 'WORKSHOP_CANCELLED',
          message: 'Không thể cập nhật workshop đã hủy.',
        },
      });
    }

    // Validate schedule if times are being changed
    const startTime = dto.startTime ? dto.startTime : workshop.startTime.toISOString();
    const endTime = dto.endTime ? dto.endTime : workshop.endTime.toISOString();
    if (dto.startTime || dto.endTime) {
      this.validateSchedule(startTime, endTime);
    }

    // Validate room conflict if room or time is being changed
    const room = dto.room ?? workshop.room;
    if (dto.room || dto.startTime || dto.endTime) {
      await this.checkRoomConflict(room, startTime, endTime, id);
    }

    // Validate maxSeats reduction
    if (dto.maxSeats !== undefined) {
      const currentRegistrations = workshop.maxSeats - workshop.availableSeats;
      if (dto.maxSeats < currentRegistrations) {
        throw new BadRequestException({
          success: false,
          error: {
            code: 'SEATS_BELOW_REGISTRATIONS',
            message: `Không thể giảm sức chứa dưới số đăng ký hiện tại (${currentRegistrations}).`,
          },
        });
      }
      // Adjust availableSeats proportionally
      const seatsDiff = dto.maxSeats - workshop.maxSeats;
      workshop.availableSeats += seatsDiff;
    }

    // Apply partial update
    if (dto.title !== undefined) workshop.title = dto.title;
    if (dto.description !== undefined) workshop.description = dto.description;
    if (dto.speaker !== undefined) workshop.speaker = dto.speaker;
    if (dto.room !== undefined) workshop.room = dto.room;
    if (dto.roomMapUrl !== undefined) workshop.roomMapUrl = dto.roomMapUrl;
    if (dto.startTime !== undefined) workshop.startTime = new Date(dto.startTime);
    if (dto.endTime !== undefined) workshop.endTime = new Date(dto.endTime);
    if (dto.maxSeats !== undefined) workshop.maxSeats = dto.maxSeats;
    if (dto.price !== undefined) workshop.price = dto.price;

    const saved = await this.workshopRepo.save(workshop);
    this.logger.log(`Workshop ${id} updated`);
    return saved;
  }

  // ──────────────────────────────────────────────────────────
  // Publish workshop (ORGANIZER)
  // ──────────────────────────────────────────────────────────

  async publish(id: string): Promise<Workshop> {
    const workshop = await this.findOneOrFail(id);

    if (workshop.status === WorkshopStatus.CANCELLED) {
      throw new BadRequestException({
        success: false,
        error: {
          code: 'WORKSHOP_CANCELLED',
          message: 'Không thể publish workshop đã hủy.',
        },
      });
    }

    workshop.status = WorkshopStatus.PUBLISHED;
    const saved = await this.workshopRepo.save(workshop);
    this.logger.log(`Workshop ${id} published`);
    return saved;
  }

  // ──────────────────────────────────────────────────────────
  // Cancel workshop (ORGANIZER) — soft delete
  // ──────────────────────────────────────────────────────────

  async cancel(id: string): Promise<Workshop> {
    const workshop = await this.findOneOrFail(id);

    workshop.status = WorkshopStatus.CANCELLED;
    const saved = await this.workshopRepo.save(workshop);
    this.logger.log(`Workshop ${id} cancelled`);

    // NOTE: Refund and notification logic will be handled by
    // RegistrationService and NotificationService respectively
    // when those modules are integrated. Keeping SRP clean.

    return saved;
  }

  // ──────────────────────────────────────────────────────────
  // List workshops (ALL) — PUBLISHED only for listing
  // ──────────────────────────────────────────────────────────

  async findAll(query: QueryWorkshopDto) {
    const qb = this.workshopRepo.createQueryBuilder('w');

    // Only show PUBLISHED workshops in public listing
    qb.where('w.status = :status', { status: WorkshopStatus.PUBLISHED });

    // Filter by date
    if (query.date) {
      qb.andWhere('DATE(w.start_time) = :date', { date: query.date });
    }

    // Filter free workshops
    if (query.free === 'true') {
      qb.andWhere('w.price = 0');
    }

    // Search by title or description
    if (query.search) {
      qb.andWhere(
        '(LOWER(w.title) LIKE :search OR LOWER(w.description) LIKE :search)',
        { search: `%${query.search.toLowerCase()}%` },
      );
    }

    qb.orderBy('w.start_time', 'ASC');

    const total = await qb.getCount();
    const totalPages = Math.ceil(total / query.limit);

    qb.skip((query.page - 1) * query.limit).take(query.limit);
    const data = await qb.getMany();

    return {
      data,
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages,
      },
    };
  }

  // ──────────────────────────────────────────────────────────
  // Get workshop by ID (ALL)
  // ──────────────────────────────────────────────────────────

  async findOne(id: string): Promise<Workshop> {
    return this.findOneOrFail(id);
  }

  // ──────────────────────────────────────────────────────────
  // Private helpers
  // ──────────────────────────────────────────────────────────

  private async findOneOrFail(id: string): Promise<Workshop> {
    const workshop = await this.workshopRepo.findOne({ where: { id } });
    if (!workshop) {
      throw new NotFoundException({
        success: false,
        error: {
          code: 'WORKSHOP_NOT_FOUND',
          message: 'Workshop không tồn tại.',
        },
      });
    }
    return workshop;
  }

  private validateSchedule(startTime: string, endTime: string): void {
    const start = new Date(startTime);
    const end = new Date(endTime);
    const now = new Date();

    if (start < now) {
      throw new BadRequestException({
        success: false,
        error: {
          code: 'INVALID_SCHEDULE',
          message: 'Thời gian bắt đầu không được trong quá khứ.',
        },
      });
    }

    if (end <= start) {
      throw new BadRequestException({
        success: false,
        error: {
          code: 'INVALID_SCHEDULE',
          message: 'Thời gian kết thúc phải sau thời gian bắt đầu.',
        },
      });
    }
  }

  private async checkRoomConflict(
    room: string | undefined | null,
    startTime: string,
    endTime: string,
    excludeId?: string,
  ): Promise<void> {
    if (!room) return; // No room to check

    const qb = this.workshopRepo
      .createQueryBuilder('w')
      .where('w.room = :room', { room })
      .andWhere('w.status != :cancelled', { cancelled: WorkshopStatus.CANCELLED })
      .andWhere('w.start_time < :endTime', { endTime: new Date(endTime) })
      .andWhere('w.end_time > :startTime', { startTime: new Date(startTime) });

    if (excludeId) {
      qb.andWhere('w.id != :excludeId', { excludeId });
    }

    const conflict = await qb.getOne();
    if (conflict) {
      throw new ConflictException({
        success: false,
        error: {
          code: 'ROOM_CONFLICT',
          message: `Phòng "${room}" đã có workshop khác trong khung giờ này.`,
        },
      });
    }
  }
}
