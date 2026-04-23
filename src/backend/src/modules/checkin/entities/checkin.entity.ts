import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../../auth/entities/user.entity.js';
import { Registration } from '../../registration/entities/registration.entity.js';

export enum CheckInSource {
  ONLINE = 'ONLINE',
  OFFLINE_SYNC = 'OFFLINE_SYNC',
}

@Entity('check_ins')
export class CheckIn {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'registration_id', type: 'uuid' })
  registrationId!: string;

  @Column({ name: 'scanned_by', type: 'uuid', nullable: true })
  scannedBy!: string | null;

  @Column({ name: 'scanned_at', type: 'timestamptz' })
  scannedAt!: Date;

  @Column({ type: 'varchar', length: 20, default: CheckInSource.ONLINE })
  source!: CheckInSource;

  @ManyToOne(() => Registration, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'registration_id' })
  registration!: Registration;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'scanned_by' })
  scanner!: User | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
