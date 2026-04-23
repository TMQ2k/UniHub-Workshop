import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../../auth/entities/user.entity.js';
import { Workshop } from '../../workshop/entities/workshop.entity.js';

export enum RegistrationStatus {
  PENDING_PAYMENT = 'PENDING_PAYMENT',
  CONFIRMED = 'CONFIRMED',
  CANCELLED = 'CANCELLED',
}

@Entity('registrations')
export class Registration {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'workshop_id', type: 'uuid' })
  workshopId!: string;

  @Column({ name: 'student_id', type: 'uuid' })
  studentId!: string;

  @Column({ type: 'varchar', length: 30, default: RegistrationStatus.PENDING_PAYMENT })
  status!: RegistrationStatus;

  @Column({ name: 'qr_code', type: 'varchar', length: 500, nullable: true })
  qrCode!: string | null;

  @Column({ name: 'seat_hold_expires_at', type: 'timestamptz', nullable: true })
  seatHoldExpiresAt!: Date | null;

  @ManyToOne(() => Workshop, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workshop_id' })
  workshop!: Workshop;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'student_id' })
  student!: User;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
