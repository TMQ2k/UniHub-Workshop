import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Workshop } from '../../workshop/entities/workshop.entity.js';

export enum AiSummaryStatus {
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

@Entity('ai_summaries')
export class AiSummary {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'workshop_id', type: 'uuid' })
  workshopId!: string;

  @ManyToOne(() => Workshop, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workshop_id' })
  workshop!: Workshop;

  @Column({ name: 'pdf_path', type: 'varchar', length: 500, nullable: true })
  pdfPath!: string | null;

  @Column({ type: 'text', nullable: true })
  summary!: string | null;

  @Column({ type: 'varchar', length: 20, default: AiSummaryStatus.PROCESSING })
  status!: AiSummaryStatus;

  @Column({ name: 'generated_at', type: 'timestamptz', nullable: true })
  generatedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
