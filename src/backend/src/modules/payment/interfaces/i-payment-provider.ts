/**
 * Payment metadata passed to the payment provider.
 */
export interface PaymentMetadata {
  registrationId: string;
  studentId: string;
  workshopId: string;
  workshopTitle: string;
}

/**
 * Result returned by the payment provider after processing.
 */
export interface PaymentResult {
  success: boolean;
  transactionId: string;
  message?: string;
}



/**
 * Payment status returned by the provider.
 */
export interface PaymentStatusResult {
  transactionId: string;
  status: 'COMPLETED' | 'PROCESSING' | 'FAILED';
}

/**
 * IPaymentProvider — Liskov Substitution Principle.
 *
 * Any implementation (MockPaymentProvider, VNPayProvider, MomoProvider)
 * must be fully substitutable for this interface.
 *
 * Adding a new provider = creating a new class implementing this interface.
 * PaymentService is NEVER modified (OCP + LSP).
 */
export interface IPaymentProvider {
  processPayment(amount: number, metadata: PaymentMetadata): Promise<PaymentResult>;
  getStatus(transactionId: string): Promise<PaymentStatusResult>;
}

/**
 * DI token for injecting the payment provider.
 */
export const PAYMENT_PROVIDER = 'PAYMENT_PROVIDER';
