import { Injectable, Logger } from '@nestjs/common';

/**
 * PdfExtractService — Extracts workshop fields from raw PDF text
 * using regex-based pattern matching.
 *
 * SRP: Only responsible for text → structured data extraction.
 * No PDF parsing, no file I/O, no AI calls.
 */
@Injectable()
export class PdfExtractService {
  private readonly logger = new Logger(PdfExtractService.name);

  /**
   * Parse raw text content and extract workshop-related fields.
   * Uses a combination of label-matching and heuristics.
   */
  extractWorkshopFields(text: string): Record<string, string | number | null> {
    this.logger.log(`Extracting workshop fields from ${text.length} chars`);

    const result: Record<string, string | number | null> = {
      title: this.extractField(text, [
        /(?:ti[eê]u\s*[đd][eề]|title|t[eê]n\s*workshop)[:\s]*(.+?)(?:\n|$)/i,
        /^(.{10,80})$/m, // First reasonable-length line as fallback title
      ]),
      description: this.extractField(text, [
        /(?:m[oô]\s*t[aả]|description|n[oộ]i\s*dung|gi[oớ]i\s*thi[eệ]u)[:\s]*(.+?)(?:\n\n|\n[A-Z])/is,
      ]),
      speaker: this.extractField(text, [
        /(?:di[eễ]n\s*gi[aả]|speaker|ng[uư][oờ]i\s*tr[iì]nh\s*b[aà]y|gi[aả]ng\s*vi[eê]n)[:\s]*(.+?)(?:\n|$)/i,
      ]),
      room: this.extractField(text, [
        /(?:ph[oò]ng|room|[đd][iị]a\s*[đd]i[eể]m|location|n[oơ]i)[:\s]*(.+?)(?:\n|$)/i,
      ]),
      startTime: this.extractDateTime(text, [
        /(?:b[aắ]t\s*[đd][aầ]u|start|th[oờ]i\s*gian\s*b[aắ]t\s*[đd][aầ]u)[:\s]*(.+?)(?:\n|$)/i,
        /(?:th[oờ]i\s*gian)[:\s]*(.+?)(?:\n|$)/i,
      ]),
      endTime: this.extractDateTime(text, [
        /(?:k[eế]t\s*th[uú]c|end|th[oờ]i\s*gian\s*k[eế]t\s*th[uú]c)[:\s]*(.+?)(?:\n|$)/i,
      ]),
      maxSeats: this.extractNumber(text, [
        /(?:s[oố]\s*ch[oỗ]|max\s*seats?|s[oố]\s*l[uư][oợ]ng|seats?|gh[eế])[:\s]*(\d+)/i,
      ]),
      price: this.extractNumber(text, [
        /(?:gi[aá]\s*v[eé]|price|ph[ií]|chi\s*ph[ií])[:\s]*(\d[\d.,]*)/i,
      ]),
    };

    this.logger.log(`Extracted fields: ${Object.keys(result).filter(k => result[k] !== null).join(', ')}`);
    return result;
  }

  private extractField(text: string, patterns: RegExp[]): string | null {
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match?.[1]) {
        return match[1].trim();
      }
    }
    return null;
  }

  private extractDateTime(text: string, patterns: RegExp[]): string | null {
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match?.[1]) {
        const raw = match[1].trim();
        // Try to parse various Vietnamese date formats
        const parsed = this.parseVietnameseDateTime(raw);
        return parsed || raw;
      }
    }
    return null;
  }

  private extractNumber(text: string, patterns: RegExp[]): number | null {
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match?.[1]) {
        const num = parseInt(match[1].replace(/[.,]/g, ''), 10);
        return isNaN(num) ? null : num;
      }
    }
    return null;
  }

  /**
   * Parse Vietnamese date/time strings like:
   * "10/05/2026 08:30" or "ngày 10 tháng 5 năm 2026, 8h30"
   */
  private parseVietnameseDateTime(raw: string): string | null {
    // DD/MM/YYYY HH:mm
    const m1 = raw.match(/(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})\s*[,\s]*(\d{1,2})[h:](\d{2})/);
    if (m1) {
      const [, d, mo, y, h, mi] = m1;
      return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}T${h.padStart(2, '0')}:${mi}:00`;
    }

    // "ngày X tháng Y năm Z" pattern
    const m2 = raw.match(/ng[aà]y\s*(\d{1,2})\s*th[aá]ng\s*(\d{1,2})\s*n[aă]m\s*(\d{4})/i);
    if (m2) {
      const [, d, mo, y] = m2;
      const timeMatch = raw.match(/(\d{1,2})[h:](\d{2})/);
      const h = timeMatch?.[1] || '08';
      const mi = timeMatch?.[2] || '00';
      return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}T${h.padStart(2, '0')}:${mi}:00`;
    }

    return null;
  }
}
