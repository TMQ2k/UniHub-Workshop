import {
  Controller,
  Post,
  Get,
  Param,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { randomUUID } from 'crypto';
import { AiSummaryService } from './ai-summary.service.js';
import { JwtAuthGuard, RolesGuard } from '../../common/guards/index.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { UserRole } from '../auth/entities/user.entity.js';

const UPLOAD_DIR = join(process.cwd(), 'uploads', 'pdfs');

/**
 * AiSummaryController — HTTP layer only.
 * SRP: No business logic, no PDF parsing, no AI calls.
 * All logic is delegated to AiSummaryService and its dependencies.
 */
@Controller('workshops')
export class AiSummaryController {
  constructor(private readonly aiSummaryService: AiSummaryService) {}

  // ──────────────────────────────────────────────────────────
  // POST /workshops/:id/ai-summary — Upload PDF (ORGANIZER)
  // ──────────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ORGANIZER)
  @Post(':id/ai-summary')
  @HttpCode(HttpStatus.ACCEPTED)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: UPLOAD_DIR,
        filename: (_req, file, cb) => {
          const uniqueName = `${Date.now()}-${randomUUID()}${extname(file.originalname)}`;
          cb(null, uniqueName);
        },
      }),
    }),
  )
  async uploadPdf(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    const data = await this.aiSummaryService.uploadPdf(id, file);
    return {
      success: true,
      data,
    };
  }

  // ──────────────────────────────────────────────────────────
  // GET /workshops/:id/ai-summary — Get summary status (ALL)
  // ──────────────────────────────────────────────────────────

  @Get(':id/ai-summary')
  async getSummary(@Param('id', ParseUUIDPipe) id: string) {
    const data = await this.aiSummaryService.getSummary(id);
    return {
      success: true,
      data,
    };
  }
}
