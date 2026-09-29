import { Module } from '@nestjs/common';
import { DigiflazzController } from './digiflazz.controller';
import { DigiflazzService } from './digiflazz.service';
import { HaybiClient } from './digiflazz.client';
import { SecretCryptoService } from '../../../common/crypto/secret-crypto.service';

@Module({
  controllers: [DigiflazzController],
  providers: [DigiflazzService, HaybiClient, SecretCryptoService],
})
export class DigiflazzModule {}
