import { Injectable, Logger } from '@nestjs/common';
import { AiService } from './ai.service.js';

/**
 * PdfExtractService — Extracts workshop fields from raw PDF text.
 *
 * Strategy: AI-first with regex fallback.
 *
 * 1. PRIMARY: Send the cleaned text to Gemini AI for intelligent
 *    extraction. The AI understands synonyms, paraphrases, and
 *    natural language patterns (e.g. "sẽ tổ chức vào lúc 8h sáng",
 *    "giới hạn 100 khách mời", "phí tham dự 50.000 VNĐ").
 *
 * 2. FALLBACK: If AI fails (rate limit, auth error, timeout),
 *    fall back to basic regex pattern matching for common labels.
 *
 * SRP: Only responsible for text → structured data extraction.
 * No PDF parsing, no file I/O.
 */
@Injectable()
export class PdfExtractService {
  private readonly logger = new Logger(PdfExtractService.name);

  constructor(private readonly aiService: AiService) {}

  /**
   * Extract workshop fields from PDF text content.
   * Uses AI for intelligent extraction, regex as fallback.
   */
  async extractWorkshopFields(
    text: string,
  ): Promise<Record<string, string | number | null>> {
    this.logger.log(`Extracting workshop fields from ${text.length} chars`);

    // ── Primary: AI-powered extraction ────────────────────
    try {
      const aiResult = await this.aiService.extractWorkshopFields(text);
      const filledCount = Object.values(aiResult).filter(
        (v) => v !== null,
      ).length;

      this.logger.log(
        `AI extraction succeeded: ${filledCount}/8 fields filled`,
      );

      // If AI extracted at least 2 fields, use the result
      if (filledCount >= 2) {
        return aiResult;
      }

      this.logger.warn(
        'AI extracted fewer than 2 fields, falling back to regex',
      );
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.warn(`AI extraction failed (${msg}), using regex fallback`);
    }

    // ── Fallback: Regex-based extraction ──────────────────
    return this.extractByRegex(text);
  }

  // ──────────────────────────────────────────────────────────
  // Regex Fallback — Basic pattern matching for common labels
  // ──────────────────────────────────────────────────────────

  private extractByRegex(
    text: string,
  ): Record<string, string | number | null> {
    this.logger.log('Using regex fallback for field extraction');

    const result: Record<string, string | number | null> = {
      title: null,
      description: null,
      speaker: null,
      room: null,
      startTime: null,
      endTime: null,
      maxSeats: null,
      price: null,
    };

    const lines = text.split('\n');

    // Title: first meaningful line or "WORKSHOP: ..." header
    result.title = this.extractTitle(lines);

    // Label-based single-line fields
    result.speaker = this.findLabeledValue(text, [
      /(?:di[eễ]n\s*gi[aả]|speaker|ng[uư][oờ]i\s*tr[iì]nh\s*b[aà]y|gi[aả]ng\s*vi[eê]n|khách\s*mời)\s*[:\-–—\t]\s*(.+)/i,
    ]);
    result.room = this.findLabeledValue(text, [
      /(?:ph[oò]ng|room|[đd][iị]a\s*[đd]i[eể]m|location|h[oộ]i\s*tr[uư][oờ]ng|n[oơ]i\s*t[oổ]\s*ch[uứ]c)\s*[:\-–—\t]\s*(.+)/i,
    ]);

    // Time fields
    const startRaw = this.findLabeledValue(text, [
      /(?:b[aắ]t\s*[đd][aầ]u|start|th[oờ]i\s*gian\s*b[aắ]t\s*[đd][aầ]u)\s*[:\-–—\t]\s*(.+)/i,
    ]);
    if (startRaw) result.startTime = this.parseDateTime(startRaw);

    const endRaw = this.findLabeledValue(text, [
      /(?:k[eế]t\s*th[uú]c|end|th[oờ]i\s*gian\s*k[eế]t\s*th[uú]c)\s*[:\-–—\t]\s*(.+)/i,
    ]);
    if (endRaw) result.endTime = this.parseDateTime(endRaw);

    // Combined time range: "Thời gian  11:30 AM – 01:30 PM, 31/05/2026"
    if (!result.startTime || !result.endTime) {
      const timeRangeRaw = this.findLabeledValue(text, [
        /(?:th[oờ]i\s*gian)\s*[:\-–—\t]\s*(.+)/i,
      ]);
      if (timeRangeRaw) {
        const { startTime, endTime } = this.parseTimeRange(timeRangeRaw);
        if (!result.startTime && startTime) result.startTime = startTime;
        if (!result.endTime && endTime) result.endTime = endTime;
      }
    }

    // Number fields
    const seatsRaw = this.findLabeledValue(text, [
      /(?:s[oố]\s*ch[oỗ]\s*(?:ng[oồ]i)?|max\s*seats?|s[oố]\s*l[uư][oợ]ng)\s*[:\-–—\t]\s*(.+)/i,
    ]);
    if (seatsRaw) result.maxSeats = this.parseNumber(seatsRaw);

    const priceRaw = this.findLabeledValue(text, [
      /(?:gi[aá]\s*v[eé]|price|ph[ií]\s*tham\s*d[uự]|chi\s*ph[ií])\s*[:\-–—\t]\s*(.+)/i,
    ]);
    if (priceRaw) result.price = this.parseNumber(priceRaw);

    // Description: body text (paragraphs between title and detail fields)
    if (!result.description) {
      result.description = this.extractDescription(lines);
    }

    const filledCount = Object.values(result).filter(
      (v) => v !== null,
    ).length;
    this.logger.log(`Regex fallback: ${filledCount}/8 fields filled`);
    return result;
  }

  // ── Helpers ────────────────────────────────────────────────

  /** Label prefixes to strip from title and description */
  private readonly TITLE_LABEL_RE =
    /^(?:ti[eê]u\s*[đd][eề]|title|t[eê]n\s*workshop)\s*[:\-–—\t]\s*/i;
  private readonly DESC_LABEL_RE =
    /^(?:m[oô]\s*t[aả]|description|n[oộ]i\s*dung|gi[oớ]i\s*thi[eệ]u)\s*[:\-–—\t]\s*/i;

  private extractTitle(lines: string[]): string | null {
    for (let i = 0; i < Math.min(lines.length, 10); i++) {
      const line = lines[i].trim();

      // "WORKSHOP: HÀNH TRÌNH ..."
      const workshopMatch = line.match(/^workshop\s*[:\-–—]\s*(.+)/i);
      if (workshopMatch) {
        let title = workshopMatch[1].trim();
        for (let j = i + 1; j < lines.length && j < i + 5; j++) {
          const next = lines[j].trim();
          if (next && this.isAllCaps(next) && next.length < 80) {
            title += ' ' + next;
          } else break;
        }
        return title;
      }

      // "Tiêu đề: Cách trở thành FE dev"
      const labelMatch = line.match(this.TITLE_LABEL_RE);
      if (labelMatch) {
        return line.substring(labelMatch[0].length).trim();
      }
    }

    // Fallback: first line with reasonable length
    const first = lines.find(
      (l) => l.trim().length >= 5 && l.trim().length <= 120,
    );
    return first ? first.trim() : null;
  }

  /** Patterns that signal a detail/info field (stop collecting description) */
  private readonly DETAIL_STOP_RE =
    /^(th[oô]ng\s*tin\s*chi\s*ti[eế]t|di[eễ]n\s*gi[aả]|ph[oò]ng|[đd][iị]a\s*[đd]i[eể]m|th[oờ]i\s*gian|b[aắ]t\s*[đd][aầ]u|k[eế]t\s*th[uú]c|s[oố]\s*ch[oỗ]|gi[aá]\s*v[eé])\s*[:\-–—\t]/i;

  private extractDescription(lines: string[]): string | null {
    let start = 0;
    let descLabelFound = false;

    // Skip title-like lines at the top, find where description content starts
    for (let i = 0; i < Math.min(lines.length, 10); i++) {
      const l = lines[i].trim();
      if (!l) continue;

      // Skip ALL-CAPS or "WORKSHOP: ..." lines (title area)
      if (this.isAllCaps(l) || /^workshop\s*[:\-–—]/i.test(l)) {
        start = i + 1;
        continue;
      }

      // Skip "Tiêu đề: ..." line (title label)
      if (this.TITLE_LABEL_RE.test(l)) {
        start = i + 1;
        continue;
      }

      // "Mô tả: ..." label — content starts after the label prefix
      const descMatch = l.match(this.DESC_LABEL_RE);
      if (descMatch) {
        start = i;
        descLabelFound = true;
        break;
      }

      // First non-title, non-label line = start of description
      break;
    }

    // Collect paragraphs until a detail/info label
    const body: string[] = [];
    for (let i = start; i < lines.length; i++) {
      const l = lines[i].trim();
      // Stop at detail labels (with : or tab separator)
      if (this.DETAIL_STOP_RE.test(l)) break;
      // Skip standalone bullet markers
      if (/^[•●○■□▪▸►–\-]+$/.test(l)) continue;

      // For the first line with a description label, strip the label
      if (i === start && descLabelFound) {
        const stripped = l.replace(this.DESC_LABEL_RE, '').trim();
        if (stripped) body.push(stripped);
        continue;
      }

      body.push(l);
    }
    const desc = body.join('\n').trim();
    // Clean trailing backslashes (PDF artifact)
    const cleaned = desc.replace(/\\+$/, '').trim();
    return cleaned.length >= 20 ? cleaned : null;
  }

  private findLabeledValue(text: string, patterns: RegExp[]): string | null {
    for (const p of patterns) {
      const m = text.match(p);
      if (m?.[1]) return m[1].trim();
    }
    return null;
  }

  private isAllCaps(s: string): boolean {
    const letters = s.replace(/[^a-zA-ZÀ-ỹ]/g, '');
    if (letters.length < 3) return false;
    const upper = letters.replace(/[^A-ZÀ-Ỹ]/g, '');
    return upper.length / letters.length > 0.7;
  }

  private parseDateTime(raw: string): string | null {
    const amPm = raw.match(
      /(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})\s+(\d{1,2}):(\d{2})\s*(AM|PM)/i,
    );
    if (amPm) {
      const [, p1, p2, y, hRaw, mi, meridiem] = amPm;
      let h = parseInt(hRaw, 10);
      if (meridiem.toUpperCase() === 'PM' && h < 12) h += 12;
      if (meridiem.toUpperCase() === 'AM' && h === 12) h = 0;
      return `${y}-${p1.padStart(2, '0')}-${p2.padStart(2, '0')}T${String(h).padStart(2, '0')}:${mi}:00`;
    }
    const m1 = raw.match(
      /(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})\s*[,\s]*(\d{1,2})[h:](\d{2})/,
    );
    if (m1) {
      const [, d, mo, y, h, mi] = m1;
      return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}T${h.padStart(2, '0')}:${mi}:00`;
    }
    return raw;
  }

  private parseTimeRange(raw: string): {
    startTime: string | null;
    endTime: string | null;
  } {
    let year = '', month = '', day = '';
    const dateMatch = raw.match(/(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})/);
    if (dateMatch) [, day, month, year] = dateMatch;
    if (!year) return { startTime: this.parseDateTime(raw), endTime: null };

    const datePart = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    const range = raw.match(
      /(\d{1,2}):(\d{2})\s*(AM|PM)?\s*[–—\-]\s*(\d{1,2}):(\d{2})\s*(AM|PM)?/i,
    );
    if (range) {
      const [, h1r, m1, mr1, h2r, m2, mr2] = range;
      let h1 = parseInt(h1r, 10), h2 = parseInt(h2r, 10);
      if (mr1?.toUpperCase() === 'PM' && h1 < 12) h1 += 12;
      if (mr1?.toUpperCase() === 'AM' && h1 === 12) h1 = 0;
      if (mr2?.toUpperCase() === 'PM' && h2 < 12) h2 += 12;
      if (mr2?.toUpperCase() === 'AM' && h2 === 12) h2 = 0;
      return {
        startTime: `${datePart}T${String(h1).padStart(2, '0')}:${m1}:00`,
        endTime: `${datePart}T${String(h2).padStart(2, '0')}:${m2}:00`,
      };
    }
    return { startTime: null, endTime: null };
  }

  private parseNumber(raw: string): number | null {
    const match = raw.match(/(\d[\d.,]*)/);
    if (!match) return null;
    const num = parseInt(match[1].replace(/[.,]/g, ''), 10);
    return isNaN(num) ? null : num;
  }
}
