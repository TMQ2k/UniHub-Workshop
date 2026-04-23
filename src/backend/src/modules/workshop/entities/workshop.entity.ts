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

export enum WorkshopStatus {
  DRAFT = 'DRAFT',
  PUBLISHED = 'PUBLISHED',
  CANCELLED = 'CANCELLED',
}

@Entity('workshops')
export class Workshop {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 500 })
  title!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  speaker!: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  room!: string | null;

  @Column({ name: 'room_map_url', type: 'varchar', length: 500, nullable: true })
  roomMapUrl!: string | null;

  @Column({ name: 'start_time', type: 'timestamptz' })
  startTime!: Date;

  @Column({ name: 'end_time', type: 'timestamptz' })
  endTime!: Date;

  @Column({ name: 'max_seats', type: 'int', default: 0 })
  maxSeats!: number;

  @Column({ name: 'available_seats', type: 'int', default: 0 })
  availableSeats!: number;

  @Column({ type: 'int', default: 0 })
  price!: number;

  @Column({ type: 'varchar', length: 20, default: WorkshopStatus.DRAFT })
  status!: WorkshopStatus;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy!: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'created_by' })
  creator!: User | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
