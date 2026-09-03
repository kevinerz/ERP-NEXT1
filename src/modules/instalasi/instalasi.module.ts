import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { InstalasiController } from './instalasi.controller';
import { InstalasiService } from './instalasi.service';
import { DocumentNumberModule } from '../../common/document-number/document-number.module';

@Module({
  imports: [
    DocumentNumberModule,
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
  providers: [InstalasiService],
  exports: [InstalasiService],
})
export class InstalasiModule {}
