import { Module } from '@nestjs/common';
import { PrtgController } from './prtg.controller';
import { PrtgService } from './prtg.service';
import { PrtgClient } from './prtg.client';
import { SecretCryptoService } from '../../../common/crypto/secret-crypto.service';
import { PrtgRekonController } from './rekon/prtg-rekon.controller';
import { PrtgRekonService } from './rekon/prtg-rekon.service';
import { StarsenderModule } from '../starsender/starsender.module';

@Module({
  imports: [StarsenderModule],
  controllers: [PrtgController, PrtgRekonController],
  providers: [PrtgService, PrtgClient, PrtgRekonService, SecretCryptoService],
  exports: [PrtgService],
})
export class PrtgModule {}
