import { Module } from '@nestjs/common';
import { PrtgController } from './prtg.controller';
import { PrtgService } from './prtg.service';
import { PrtgClient } from './prtg.client';
import { SecretCryptoService } from '../../../common/crypto/secret-crypto.service';

@Module({
  controllers: [PrtgController],
  providers: [PrtgService, PrtgClient, SecretCryptoService],
  exports: [PrtgService],
})
export class PrtgModule {}
