import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI } from '@google/generative-ai';

const MAX_SUMMARY_WORDS = 500;
const AI_MODEL = 'gemini-2.0-flash';

const SUMMARY_SYSTEM_PROMPT = `Bạn là trợ lý AI chuyên tóm tắt nội dung workshop cho sinh viên đại học.
Hãy tóm tắt nội dung sau bằng tiếng Việt, ngắn gọn, dễ hiểu, tối đa ${MAX_SUMMARY_WORDS} từ.
Tập trung vào: mục tiêu workshop, kiến thức/kỹ năng chính, đối tượng phù hợp.
Không thêm thông tin ngoài nội dung được cung cấp.`;

/**
 * AiService — SRP: only responsible for interacting with the
 * Google Gemini API to generate text summaries.
 *
 * This service is completely independent from Controller and PDF logic.
 */
@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly model;

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.get<string>('GOOGLE_AI_API_KEY');
    if (!apiKey) {
      this.logger.warn(
        'GOOGLE_AI_API_KEY is not set. AI summary will fail at runtime.',
      );
    }
    const genAI = new GoogleGenerativeAI(apiKey || '');
    this.model = genAI.getGenerativeModel({
      model: AI_MODEL,
      systemInstruction: SUMMARY_SYSTEM_PROMPT,
    });
  }

  /**
   * Generate a Vietnamese summary of the given text content
   * using Google Gemini API.
   *
   * @param textContent - Cleaned text extracted from PDF
   * @returns Summary string in Vietnamese
   * @throws Error with specific error codes for rate limit, timeout, auth issues
   */
  async generateSummary(textContent: string): Promise<string> {
    this.logger.log(
      `Generating AI summary for ${textContent.length} characters of content`,
    );

    try {
      const result = await this.model.generateContent(
        `Hãy tóm tắt nội dung workshop sau:\n\n${textContent}`,
      );

      const response = result.response;
      const summary = response.text().trim();

      this.logger.log(`AI summary generated: ${summary.length} characters`);
      return summary;
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

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
}
