import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { RedisModule } from './common/redis/index.js';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { NotificationModule } from './modules/notification/notification.module.js';
import { CsvSyncModule } from './modules/csv-sync/csv-sync.module.js';
import { WorkshopModule } from './modules/workshop/workshop.module.js';
import { AiSummaryModule } from './modules/ai-summary/ai-summary.module.js';

@Module({
  imports: [
    // ─── Environment Config ──────────────────────────────
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),

    // ─── PostgreSQL via TypeORM ──────────────────────────
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get<string>('POSTGRES_HOST', 'localhost'),
        port: config.get<number>('POSTGRES_PORT', 5432),
        database: config.get<string>('POSTGRES_DB', 'unihub_workshop'),
        username: config.get<string>('POSTGRES_USER', 'unihub'),
        password: config.get<string>('POSTGRES_PASSWORD', 'unihub_secret'),
        autoLoadEntities: true,
        synchronize: config.get<string>('NODE_ENV') === 'development',
        logging: config.get<string>('NODE_ENV') === 'development',
      }),
    }),

    // ─── BullMQ (Redis-backed queues) ────────────────────
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get<string>('REDIS_HOST', 'localhost'),
          port: config.get<number>('REDIS_PORT', 6379),
          password: config.get<string>('REDIS_PASSWORD', 'unihub_redis_secret'),
        },
      }),
    }),

    // ─── Redis Client (ioredis) ──────────────────────────
    RedisModule,

    // ─── Feature Modules ─────────────────────────────────
    AuthModule,
    NotificationModule,
    CsvSyncModule,
    WorkshopModule,
    AiSummaryModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
