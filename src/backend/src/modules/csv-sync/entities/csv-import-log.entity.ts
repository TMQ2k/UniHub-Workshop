import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity('csv_import_logs')
export class CsvImportLog {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 500 })
  filename!: string;

  @Column({ type: 'varchar', length: 20, default: 'QUEUED' })
  status!: string;

  @Column({ name: 'total_rows', type: 'int', default: 0 })
  totalRows!: number;

  @Column({ type: 'int', default: 0 })
  inserted!: number;

  @Column({ type: 'int', default: 0 })
  updated!: number;

  @Column({ type: 'int', default: 0 })
  skipped!: number;

  @Column({ type: 'int', default: 0 })
  failed!: number;

  @Column({ type: 'jsonb', nullable: true })
  errors!: Record<string, unknown>[] | null;

  @Column({ name: 'started_at', type: 'timestamptz', nullable: true })
  startedAt!: Date | null;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
