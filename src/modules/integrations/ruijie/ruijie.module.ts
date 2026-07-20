import { Module } from '@nestjs/common';
import { RuijieController } from './ruijie.controller';
import { RuijieService } from './ruijie.service';
import { RuijieClient } from './ruijie.client';
import { SecretCryptoService } from '../../../common/crypto/secret-crypto.service';

@Module({
  controllers: [RuijieController],
  providers: [RuijieService, RuijieClient, SecretCryptoService],
  exports: [RuijieService],
})
export class RuijieModule {}
