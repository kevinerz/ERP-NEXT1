import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';
import { InstalasiController } from './instalasi.controller';
import { InstalasiService } from './instalasi.service';
import { VendorJwtStrategy } from './vendor-jwt.strategy';
import { DocumentNumberModule } from '../../common/document-number/document-number.module';
import { PrismaService } from '../../prisma/prisma.service';

@Module({
  imports: [
    DocumentNumberModule,
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: { expiresIn: '30d' },
      }),
    }),
  ],
  controllers: [InstalasiController],
  providers: [InstalasiService, VendorJwtStrategy, PrismaService],
  exports: [InstalasiService],
})
export class InstalasiModule {}
