import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum UserRole {
  STUDENT = 'STUDENT',
  ORGANIZER = 'ORGANIZER',
  CHECKIN_STAFF = 'CHECKIN_STAFF',
}

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'student_id', type: 'varchar', length: 50, unique: true, nullable: true })
  studentId!: string | null;

  @Column({ name: 'full_name', type: 'varchar', length: 255 })
  fullName!: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  email!: string;

  @Column({ name: 'password_hash', type: 'varchar', length: 255 })
  passwordHash!: string;

  @Column({ type: 'varchar', length: 20, default: UserRole.STUDENT })
  role!: UserRole;

  @Column({ type: 'varchar', length: 255, nullable: true })
  faculty!: string | null;

  @Column({ name: 'enrollment_year', type: 'int', nullable: true })
  enrollmentYear!: number | null;

  @Column({ name: 'is_locked', type: 'boolean', default: false })
  isLocked!: boolean;

  @Column({ name: 'is_synced', type: 'boolean', default: false })
  isSynced!: boolean;

  @Column({ name: 'refresh_token_hash', type: 'varchar', length: 255, nullable: true })
  refreshTokenHash!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
