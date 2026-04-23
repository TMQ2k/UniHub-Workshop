import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';

const MAX_SUMMARY_WORDS = 500;
const AI_MODEL = 'claude-sonnet-4-20250514';

const SUMMARY_SYSTEM_PROMPT = `Bạn là trợ lý AI chuyên tóm tắt nội dung workshop cho sinh viên đại học.
Hãy tóm tắt nội dung sau bằng tiếng Việt, ngắn gọn, dễ hiểu, tối đa ${MAX_SUMMARY_WORDS} từ.
Tập trung vào: mục tiêu workshop, kiến thức/kỹ năng chính, đối tượng phù hợp.
Không thêm thông tin ngoài nội dung được cung cấp.`;

/**
 * AiService — SRP: only responsible for interacting with the
 * Anthropic Claude API to generate text summaries.
 *
 * This service is completely independent from Controller and PDF logic.
 */
@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly client: Anthropic;

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.get<string>('ANTHROPIC_API_KEY');
    if (!apiKey) {
      this.logger.warn(
        'ANTHROPIC_API_KEY is not set. AI summary will fail at runtime.',
      );
    }
    this.client = new Anthropic({ apiKey: apiKey || '' });
  }

  /**
   * Generate a Vietnamese summary of the given text content
   * using Anthropic Claude API.
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
      const response = await this.client.messages.create({
        model: AI_MODEL,
        max_tokens: 1024,
        system: SUMMARY_SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: `Hãy tóm tắt nội dung workshop sau:\n\n${textContent}`,
          },
        ],
      });

      // Extract text from the response content blocks
      const summary = response.content
        .filter((block) => block.type === 'text')
        .map((block) => {
          if (block.type === 'text') return block.text;
          return '';
        })
        .join('\n')
        .trim();

      this.logger.log(`AI summary generated: ${summary.length} characters`);
      return summary;
    } catch (error) {
      if (error instanceof Anthropic.RateLimitError) {
        throw new Error('AI_RATE_LIMITED');
      }
      if (error instanceof Anthropic.AuthenticationError) {
        throw new Error('AI_AUTH_FAILED');
      }
      if (error instanceof Anthropic.APIConnectionError) {
        throw new Error('AI_TIMEOUT');
      }
      throw error;
    }
  }
}
