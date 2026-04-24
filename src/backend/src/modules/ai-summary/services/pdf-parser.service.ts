import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import { PDFParse } from 'pdf-parse';

const MAX_TEXT_LENGTH = 50_000;

/**
 * PdfParserService — SRP: only responsible for extracting and
 * cleaning text content from PDF files.
 *
 * This service is completely independent from Controller and AI logic.
 */
@Injectable()
export class PdfParserService {
  private readonly logger = new Logger(PdfParserService.name);

  /**
   * Extract text from a PDF file on disk.
   * Preserves line breaks and tab characters for structured field extraction
   * while cleaning common PDF artifacts.
   *
   * @param filePath - Absolute path to the PDF file
   * @returns Cleaned text content, truncated to MAX_TEXT_LENGTH if too long
   * @throws Error if PDF cannot be parsed
   */
  async extractText(filePath: string): Promise<string> {
    this.logger.log(`Parsing PDF: ${filePath}`);

    const buffer = fs.readFileSync(filePath);
    const parser = new PDFParse({ data: new Uint8Array(buffer) });

    const textResult = await parser.getText();
    await parser.destroy();

    const rawText = textResult.text;

    if (!rawText || rawText.trim().length === 0) {
      throw new Error('PDF_PARSE_FAILED: không thể trích xuất nội dung từ PDF.');
    }

    const cleaned = this.cleanText(rawText);
    this.logger.log(
      `Extracted ${cleaned.length} characters from PDF (${textResult.total} pages)`,
    );

    // Chunk if text is too long — take first MAX_TEXT_LENGTH chars
    if (cleaned.length > MAX_TEXT_LENGTH) {
      this.logger.warn(
        `Text exceeds ${MAX_TEXT_LENGTH} chars, truncating for AI processing`,
      );
      return cleaned.substring(0, MAX_TEXT_LENGTH);
    }

    return cleaned;
  }

  /**
   * Clean raw PDF text: remove headers/footers, page numbers,
   * normalize whitespace while PRESERVING line breaks AND tabs.
   *
   * Tabs are critical: many PDFs use tab characters to separate
   * labels from values (e.g. "Diễn giả\tCông Sỹ").
   */
  private cleanText(raw: string): string {
    return raw
      // Remove common page number patterns (e.g., "Page 1 of 10", "- 1 -")
      .replace(/page\s+\d+\s*(of\s+\d+)?/gi, '')
      .replace(/-\s*\d+\s*-/g, '')
      // Remove pdf-parse page separator markers like "-- 1 of 3 --"
      .replace(/--\s*\d+\s*of\s*\d+\s*--/g, '')
      // Collapse multiple spaces on the same line, but keep \n and \t
      .replace(/ {2,}/g, ' ')
      // Collapse 3+ consecutive newlines into 2
      .replace(/\n{3,}/g, '\n\n')
      // Remove leading/trailing whitespace on each line (but keep tabs intact within lines)
      .replace(/^ +| +$/gm, '')
      .trim();
  }
}
