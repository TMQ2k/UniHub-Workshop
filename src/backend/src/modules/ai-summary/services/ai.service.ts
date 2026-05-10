import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI } from '@google/generative-ai';

const MAX_SUMMARY_WORDS = 150;
const AI_MODEL = 'gemini-2.5-flash';

const SUMMARY_SYSTEM_PROMPT = `Bạn là trợ lý AI viết tóm tắt giới thiệu workshop cho sinh viên đại học.

YÊU CẦU BẮT BUỘC:
- Viết tối đa ${MAX_SUMMARY_WORDS} từ, dưới dạng 1-2 đoạn văn liền mạch.
- KHÔNG dùng markdown, KHÔNG dùng tiêu đề (#), KHÔNG dùng gạch đầu dòng (-), KHÔNG dùng in đậm (**).
- KHÔNG liệt kê từng mục tiêu, từng kỹ năng riêng lẻ. Hãy tổng hợp thành câu văn tự nhiên.
- Viết như một đoạn giới thiệu ngắn gọn giúp sinh viên nhanh chóng hiểu workshop này nói về gì, học được gì, và phù hợp với ai.
- Giọng văn: tự nhiên, súc tích, không lặp ý.
- Chỉ dùng thông tin có trong nội dung được cung cấp, không bịa thêm.`;

/**
 * AiService — SRP: responsible for interacting with the
 * Google Gemini API for text generation tasks.
 *
 * Provides: generateSummary — Vietnamese summary of workshop content
 */
@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly summaryModel;

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
