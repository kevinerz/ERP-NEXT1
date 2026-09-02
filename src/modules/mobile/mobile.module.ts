import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { PrismaService } from '../../prisma/prisma.service';
import { MobileAuthController } from './mobile-auth.controller';
import { MobileTicketsController } from './mobile-tickets.controller';
import { MobileLokasiController } from './mobile-lokasi.controller';
import { MobileService } from './mobile.service';
import { MobileJwtStrategy } from './mobile-jwt.strategy';
import { FcmService } from './fcm.service';

@Module({
  imports: [
    PassportModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'next1-mobile-secret',
      signOptions: { expiresIn: '30d' },
    }),
  ],
  controllers: [MobileAuthController, MobileTicketsController, MobileLokasiController],
  providers: [MobileService, MobileJwtStrategy, FcmService, PrismaService],
  exports: [FcmService],
})
export class MobileModule {}
