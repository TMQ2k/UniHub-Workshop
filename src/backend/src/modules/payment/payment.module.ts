import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Payment } from './entities/payment.entity.js';
import { Registration } from '../registration/entities/registration.entity.js';
import { Workshop } from '../workshop/entities/workshop.entity.js';
import { PaymentService } from './payment.service.js';
import { PaymentController } from './payment.controller.js';
import { MockPaymentProvider } from './providers/mock-payment.provider.js';
import { PAYMENT_PROVIDER } from './interfaces/index.js';
import { RegistrationModule } from '../registration/registration.module.js';
import { NotificationModule } from '../notification/notification.module.js';

/**
 * PaymentModule — DIP compliant.
 *
 * PaymentService depends on IPaymentProvider (abstraction).
 * MockPaymentProvider is provided by default for development.
 *
 * To swap to VNPay/Momo:
 * 1. Create VNPayProvider implementing IPaymentProvider.
 * 2. Change `useClass: VNPayProvider` below.
 * 3. PaymentService is NEVER modified (OCP + DIP).
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Payment, Registration, Workshop]),
    RegistrationModule,
    NotificationModule,
  ],
  controllers: [PaymentController],
  providers: [
    PaymentService,
    MockPaymentProvider,
    {
      provide: PAYMENT_PROVIDER,
      useClass: MockPaymentProvider,
    },
  ],
  exports: [PaymentService],
})
export class PaymentModule {}
