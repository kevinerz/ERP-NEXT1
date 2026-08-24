import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { PortalService } from './portal.service';
import { PortalController } from './portal.controller';
import { CustomerJwtStrategy } from './customer-jwt.strategy';

@Module({
  imports: [
    PrismaModule,
    PassportModule,
    AuthModule,   // menyediakan JwtAuthGuard + TokenBlacklistService untuk admin endpoints
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: { expiresIn: '7d' },
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [PortalService, CustomerJwtStrategy],
  controllers: [PortalController],
})
export class PortalModule {}
