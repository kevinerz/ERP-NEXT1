import { Module } from '@nestjs/common';
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
  ],
  controllers: [InstalasiController],
  providers: [InstalasiService, VendorJwtStrategy, PrismaService],
  exports: [InstalasiService],
})
export class InstalasiModule {}
