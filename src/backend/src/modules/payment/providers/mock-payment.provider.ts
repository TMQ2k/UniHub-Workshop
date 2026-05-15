import { Injectable, Logger } from '@nestjs/common';
import {
  IPaymentProvider,
  PaymentMetadata,
  PaymentResult,
  PaymentStatusResult,
} from '../interfaces/index.js';

/**
 * MockPaymentProvider — development/testing implementation.
 *
 * Implements IPaymentProvider (Liskov Substitution Principle).
 * Can be swapped for VNPayProvider, MomoProvider, etc. by
 * changing the DI binding in PaymentModule — zero changes to PaymentService.
 */
@Injectable()
export class MockPaymentProvider implements IPaymentProvider {
  private readonly logger = new Logger(MockPaymentProvider.name);

  async processPayment(amount: number, metadata: PaymentMetadata): Promise<PaymentResult> {
    this.logger.log(
      `[MOCK] Processing payment: ${amount} VND for registration ${metadata.registrationId}`,
    );

    // Simulate processing delay
    await this.delay(100);

    const transactionId = `mock_txn_${Date.now()}`;

    return {
      success: true,
      transactionId,
      message: 'Mock payment processed successfully.',
    };
  }



  async getStatus(transactionId: string): Promise<PaymentStatusResult> {
    this.logger.log(`[MOCK] Getting status for transaction ${transactionId}`);

    return {
      transactionId,
      status: 'COMPLETED',
    };
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
