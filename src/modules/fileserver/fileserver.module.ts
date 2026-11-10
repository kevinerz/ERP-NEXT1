import { Module } from '@nestjs/common';
import { FileServerController } from './fileserver.controller';
import { FileServerService } from './fileserver.service';
import { SmbClient } from './smb.client';
import { SecretCryptoService } from '../../common/crypto/secret-crypto.service';

// File server kantor (SMB) — jelajah, unduh, unggah, folder
@Module({
  controllers: [FileServerController],
  providers: [FileServerService, SmbClient, SecretCryptoService],
  exports: [FileServerService],
})
export class FileServerModule {}
