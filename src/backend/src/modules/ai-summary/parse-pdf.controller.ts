import {
  Controller,
  Post,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  HttpCode,
  HttpStatus,
  BadRequestException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { randomUUID } from 'crypto';
import { existsSync, mkdirSync } from 'fs';
import { JwtAuthGuard, RolesGuard } from '../../common/guards/index.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { UserRole } from '../auth/entities/user.entity.js';
import { PdfParserService } from './services/pdf-parser.service.js';
import { PdfExtractService } from './services/pdf-extract.service.js';

const UPLOAD_DIR = join(process.cwd(), 'uploads', 'pdfs');
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

// Ensure upload directory exists on module load
if (!existsSync(UPLOAD_DIR)) {
  mkdirSync(UPLOAD_DIR, { recursive: true });
}

/**
 * ParsePdfController — Upload PDF and extract workshop fields.
 * Used by the admin form to auto-fill workshop creation fields.
 *
 * POST /api/workshops/parse-pdf
 * Returns extracted fields: title, description, speaker, room, etc.
 */
@Controller('workshops')
export class ParsePdfController {
  private readonly logger = new Logger(ParsePdfController.name);

  constructor(
    private readonly pdfParser: PdfParserService,
    private readonly pdfExtract: PdfExtractService,
  ) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ORGANIZER)
  @Post('parse-pdf')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: UPLOAD_DIR,
        filename: (_req, file, cb) => {
          const uniqueName = `${Date.now()}-${randomUUID()}${extname(file.originalname)}`;
          cb(null, uniqueName);
        },
      }),
      limits: { fileSize: MAX_FILE_SIZE },
    }),
  )
  async parsePdf(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException({
        success: false,
        error: { code: 'NO_FILE', message: 'Vui lòng upload file PDF.' },
      });
    }

    if (file.mimetype !== 'application/pdf') {
      throw new BadRequestException({
        success: false,
        error: { code: 'INVALID_FILE_TYPE', message: 'Chỉ chấp nhận file PDF.' },
      });
    }

    try {
      // Step 1: Extract text from PDF
      const text = await this.pdfParser.extractText(file.path);

      // Step 2: Extract structured workshop fields from text (AI-powered)
      const fields = await this.pdfExtract.extractWorkshopFields(text);

      return {
        success: true,
        data: {
          extractedFields: fields,
          rawTextPreview: text.substring(0, 500),
        },
      };
    } catch (error) {
      const errorMsg =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`PDF parse failed: ${errorMsg}`);

      // PDF text extraction failed
      if (errorMsg.includes('PDF_PARSE_FAILED')) {
        throw new BadRequestException({
          success: false,
          error: {
            code: 'PDF_PARSE_FAILED',
            message:
              'Không thể đọc nội dung từ file PDF. Vui lòng kiểm tra file không bị hỏng hoặc được bảo vệ bằng mật khẩu.',
          },
        });
      }

      // Fallback: structured 500 that frontend can understand
      throw new InternalServerErrorException({
        success: false,
        error: {
          code: 'EXTRACT_FAILED',
          message:
            'Đã xảy ra lỗi khi phân tích PDF. Vui lòng thử lại.',
        },
      });
    }
  }
}
