import {
  Controller,
  Post,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { randomUUID } from 'crypto';
import { JwtAuthGuard, RolesGuard } from '../../common/guards/index.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { UserRole } from '../auth/entities/user.entity.js';
import { PdfParserService } from './services/pdf-parser.service.js';
import { PdfExtractService } from './services/pdf-extract.service.js';

const UPLOAD_DIR = join(process.cwd(), 'uploads', 'pdfs');
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

/**
 * ParsePdfController — Upload PDF and extract workshop fields.
 * Used by the admin form to auto-fill workshop creation fields.
 *
 * POST /api/workshops/parse-pdf
 * Returns extracted fields: title, description, speaker, room, etc.
 */
@Controller('workshops')
export class ParsePdfController {
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
  }
}
