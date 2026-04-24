import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI } from '@google/generative-ai';

const MAX_SUMMARY_WORDS = 500;
const AI_MODEL = 'gemini-2.5-flash';

const SUMMARY_SYSTEM_PROMPT = `Bạn là trợ lý AI chuyên tóm tắt nội dung workshop cho sinh viên đại học.
Hãy tóm tắt nội dung sau bằng tiếng Việt, ngắn gọn, dễ hiểu, tối đa ${MAX_SUMMARY_WORDS} từ.
Tập trung vào: mục tiêu workshop, kiến thức/kỹ năng chính, đối tượng phù hợp.
Không thêm thông tin ngoài nội dung được cung cấp.`;

const EXTRACT_SYSTEM_PROMPT = `Bạn là trợ lý AI chuyên trích xuất thông tin workshop từ tài liệu PDF.
Nhiệm vụ: Đọc nội dung văn bản được cung cấp và trích xuất chính xác các trường thông tin workshop.

Hướng dẫn trích xuất từng trường:

1. **title** (Tiêu đề): Tiêu đề workshop thường nằm ở đầu tài liệu, có thể viết hoa toàn bộ hoặc nổi bật. Có thể bắt đầu bằng "Workshop:", "Hội thảo:", "Buổi chia sẻ:" hoặc tương tự. Trích xuất tên workshop, bỏ tiền tố "Workshop:" nếu có.

2. **description** (Mô tả): Là một hoặc nhiều đoạn văn mô tả nội dung, mục tiêu, hoặc giới thiệu chung về workshop. Thường KHÔNG đề cập thời gian, địa điểm cụ thể mà nói bao quát về chủ đề. Giữ nguyên nội dung, không tóm tắt.

3. **speaker** (Diễn giả): Tên người trình bày, có thể được nêu rõ với từ khóa như "diễn giả", "speaker", "giảng viên", "người trình bày", "khách mời", hoặc được chú thích trong phần thông tin chi tiết. Chỉ trả về tên, không kèm chức danh trừ khi không thể tách rời.

4. **room** (Phòng): Địa điểm tổ chức, có thể được ghi là "Phòng X", "Hội trường Y", "Tại Z", "Địa điểm: ...", hoặc tương tự. Trả về tên phòng/địa điểm ngắn gọn.

5. **startTime** (Thời gian bắt đầu): Có thể được diễn đạt như "bắt đầu lúc...", "sẽ tổ chức vào lúc...", "từ ... giờ", "khai mạc lúc...", hoặc nằm trong cụm "11:30 AM – 01:30 PM, 31/05/2026". Trả về dạng ISO: YYYY-MM-DDTHH:mm:00.

6. **endTime** (Thời gian kết thúc): Có thể được diễn đạt như "kết thúc lúc...", "đến ... giờ", "bế mạc lúc...", hoặc là phần sau dấu "–" trong cụm thời gian. Trả về dạng ISO: YYYY-MM-DDTHH:mm:00.

7. **maxSeats** (Số chỗ ngồi): Số lượng chỗ, có thể được ghi là "N chỗ", "sức chứa N người", "giới hạn N khách mời", "chỉ dành cho N người đầu tiên", hoặc tương tự. Trả về số nguyên.

8. **price** (Giá vé): Chi phí tham dự, thường theo sau bởi đơn vị tiền tệ (VNĐ, đồng, VND). Có thể ghi là "miễn phí" (= 0), "X VNĐ", "phí tham dự X đồng", hoặc tương tự. Trả về số nguyên (không có đơn vị tiền).

**Quy tắc quan trọng:**
- Nếu không tìm thấy thông tin cho một trường, trả về null.
- Chỉ trích xuất từ nội dung có sẵn, KHÔNG bịa thông tin.
- Trả về ĐÚNG JSON, không có markdown code block, không có giải thích thêm.
- Thời gian phải ở dạng ISO 8601: YYYY-MM-DDTHH:mm:00
- Số (maxSeats, price) phải là số nguyên, không có dấu phẩy hay đơn vị.`;

/**
 * AiService — SRP: responsible for interacting with the
 * Google Gemini API for text generation tasks.
 *
 * Provides two capabilities:
 * 1. generateSummary — Vietnamese summary of workshop content
 * 2. extractWorkshopFields — Structured field extraction from PDF text
 */
@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly summaryModel;
  private readonly extractModel;

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.get<string>('GOOGLE_AI_API_KEY');
    if (!apiKey) {
      this.logger.warn(
        'GOOGLE_AI_API_KEY is not set. AI features will fail at runtime.',
      );
    }
    const genAI = new GoogleGenerativeAI(apiKey || '');

    // Summary model — with summary system instruction
    this.summaryModel = genAI.getGenerativeModel({
      model: AI_MODEL,
      systemInstruction: SUMMARY_SYSTEM_PROMPT,
    });

    // Extract model — with extraction system instruction + JSON mode
    this.extractModel = genAI.getGenerativeModel({
      model: AI_MODEL,
      systemInstruction: EXTRACT_SYSTEM_PROMPT,
      generationConfig: {
        responseMimeType: 'application/json',
      },
    });
  }

  /**
   * Generate a Vietnamese summary of the given text content.
   */
  async generateSummary(textContent: string): Promise<string> {
    this.logger.log(
      `Generating AI summary for ${textContent.length} characters of content`,
    );

    try {
      const result = await this.summaryModel.generateContent(
        `Hãy tóm tắt nội dung workshop sau:\n\n${textContent}`,
      );

      const response = result.response;
      const summary = response.text().trim();

      this.logger.log(`AI summary generated: ${summary.length} characters`);
      return summary;
    } catch (error: unknown) {
      this.handleAiError(error);
      throw error; // unreachable, but satisfies TS
    }
  }

  /**
   * Extract structured workshop fields from PDF text using AI.
   *
   * Sends the full text to Gemini with a detailed extraction prompt.
   * Gemini returns a JSON object with the 8 workshop fields.
   *
   * @param textContent - Cleaned text extracted from PDF
   * @returns Parsed JSON object with workshop fields
   * @throws Error if AI call fails or response cannot be parsed
   */
  async extractWorkshopFields(
    textContent: string,
  ): Promise<Record<string, string | number | null>> {
    this.logger.log(
      `Extracting workshop fields via AI from ${textContent.length} chars`,
    );

    try {
      const prompt = `Trích xuất thông tin workshop từ nội dung PDF sau và trả về JSON với các trường: title, description, speaker, room, startTime, endTime, maxSeats, price.

Nội dung PDF:
---
${textContent}
---

Trả về JSON object duy nhất với đúng 8 trường trên.`;

      const result = await this.extractModel.generateContent(prompt);
      const response = result.response;
      const rawJson = response.text().trim();

      this.logger.log(`AI extraction raw response: ${rawJson.length} chars`);

      // Parse JSON response
      const parsed = JSON.parse(rawJson);

      // Validate and normalize the result
      return this.normalizeExtractedFields(parsed);
    } catch (error: unknown) {
      if (error instanceof SyntaxError) {
        this.logger.error('AI returned invalid JSON for field extraction');
        throw new Error('AI_INVALID_RESPONSE');
      }
      this.handleAiError(error);
      throw error;
    }
  }

  /**
   * Normalize AI-extracted fields to ensure correct types.
   */
  private normalizeExtractedFields(
    raw: Record<string, unknown>,
  ): Record<string, string | number | null> {
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

    // String fields
    for (const key of [
      'title',
      'description',
      'speaker',
      'room',
      'startTime',
      'endTime',
    ]) {
      if (raw[key] != null && raw[key] !== '') {
        result[key] = String(raw[key]).trim();
      }
    }

    // Number fields
    for (const key of ['maxSeats', 'price']) {
      if (raw[key] != null) {
        const num =
          typeof raw[key] === 'number'
            ? (raw[key] as number)
            : parseInt(String(raw[key]).replace(/[^\d]/g, ''), 10);
        result[key] = isNaN(num) ? null : num;
      }
    }

    // Special: if price is "miễn phí" or similar
    if (raw['price'] != null && typeof raw['price'] === 'string') {
      const lower = raw['price'].toLowerCase();
      if (
        lower.includes('miễn phí') ||
        lower.includes('free') ||
        lower === '0'
      ) {
        result['price'] = 0;
      }
    }

    return result;
  }

  /**
   * Shared error handler for Gemini API errors.
   */
  private handleAiError(error: unknown): never {
    const errorMessage = error instanceof Error ? error.message : String(error);

    if (errorMessage.includes('429') || errorMessage.includes('RATE_LIMIT')) {
      throw new Error('AI_RATE_LIMITED');
    }
    if (
      errorMessage.includes('401') ||
      errorMessage.includes('403') ||
      errorMessage.includes('API_KEY')
    ) {
      throw new Error('AI_AUTH_FAILED');
    }
    if (
      errorMessage.includes('DEADLINE_EXCEEDED') ||
      errorMessage.includes('timeout')
    ) {
      throw new Error('AI_TIMEOUT');
    }
    throw error;
  }
}
