import {
  Injectable,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CheckIn, CheckInSource } from './entities/checkin.entity.js';
import { Registration, RegistrationStatus } from '../registration/entities/registration.entity.js';
import { SyncCheckInItemDto } from './dto/index.js';

/** Result status for each item in a batch sync */
export type SyncResultStatus = 'synced' | 'failed';

/** Result for a single check-in sync attempt */
export interface SyncItemResult {
  registrationId: string;
  status: SyncResultStatus;
  reason?: string;
}

@Injectable()
export class CheckinService {
  private readonly logger = new Logger(CheckinService.name);

  constructor(
    @InjectRepository(CheckIn)
    private readonly checkinRepo: Repository<CheckIn>,
    @InjectRepository(Registration)
    private readonly registrationRepo: Repository<Registration>,
  ) {}

  // ──────────────────────────────────────────────────────────
  // Batch Sync — Offline check-ins (Last-write-wins)
  // ──────────────────────────────────────────────────────────

  async syncOfflineCheckins(
    items: SyncCheckInItemDto[],
    scannedByUserId: string,
  ): Promise<{ synced: number; failed: number; results: SyncItemResult[] }> {
    // Sort by scannedAt ascending (FIFO — spec requirement)
    const sorted = [...items].sort(
      (a, b) => new Date(a.scannedAt).getTime() - new Date(b.scannedAt).getTime(),
    );

    const results: SyncItemResult[] = [];
    let synced = 0;
    let failed = 0;

    for (const item of sorted) {
      const result = await this.processSingleCheckin(item, scannedByUserId);
      results.push(result);

      if (result.status === 'synced') {
        synced++;
      } else {
        failed++;
      }
    }

    this.logger.log(
      `Offline sync completed: synced=${synced}, failed=${failed}, by=${scannedByUserId}`,
    );

    return { synced, failed, results };
  }

  // ──────────────────────────────────────────────────────────
  // Process a single check-in item
  // ──────────────────────────────────────────────────────────

  private async processSingleCheckin(
    item: SyncCheckInItemDto,
    scannedByUserId: string,
  ): Promise<SyncItemResult> {
    // Step 1: Validate registration exists
    const registration = await this.registrationRepo.findOne({
      where: { id: item.registrationId },
    });

    if (!registration) {
      return {
        registrationId: item.registrationId,
        status: 'failed',
        reason: 'REGISTRATION_NOT_FOUND',
      };
    }

    // Step 2: Validate registration is CONFIRMED
    if (registration.status === RegistrationStatus.CANCELLED) {
      return {
        registrationId: item.registrationId,
        status: 'failed',
        reason: 'REGISTRATION_CANCELLED',
      };
    }

    if (registration.status !== RegistrationStatus.CONFIRMED) {
      return {
        registrationId: item.registrationId,
        status: 'failed',
        reason: 'REGISTRATION_NOT_CONFIRMED',
      };
    }

    // Step 3: Validate workshopId matches
    if (registration.workshopId !== item.workshopId) {
      return {
        registrationId: item.registrationId,
        status: 'failed',
        reason: 'WORKSHOP_MISMATCH',
      };
    }

    // Step 4: Check existing check-in — Last-write-wins conflict resolution
    const existingCheckin = await this.checkinRepo.findOne({
      where: { registrationId: item.registrationId },
    });

    if (existingCheckin) {
      const incomingTime = new Date(item.scannedAt).getTime();
      const existingTime = new Date(existingCheckin.scannedAt).getTime();

      // Last-write-wins: keep the EARLIER scan (first check-in wins)
      // Spec: "Check-in đầu tiên được giữ, lần sau trả ALREADY_CHECKED_IN"
      if (incomingTime >= existingTime) {
        return {
          registrationId: item.registrationId,
          status: 'failed',
          reason: 'ALREADY_CHECKED_IN',
        };
      }

      // Incoming is earlier → overwrite existing record (last-write-wins by timestamp)
      existingCheckin.scannedAt = new Date(item.scannedAt);
      existingCheckin.scannedBy = scannedByUserId;
      existingCheckin.source = CheckInSource.OFFLINE_SYNC;
      await this.checkinRepo.save(existingCheckin);

      return {
        registrationId: item.registrationId,
        status: 'synced',
      };
    }

    // Step 5: Create new check-in record
    const checkin = this.checkinRepo.create({
      registrationId: item.registrationId,
      scannedBy: scannedByUserId,
      scannedAt: new Date(item.scannedAt),
      source: CheckInSource.OFFLINE_SYNC,
    });

    await this.checkinRepo.save(checkin);

    return {
      registrationId: item.registrationId,
      status: 'synced',
    };
  }
}
