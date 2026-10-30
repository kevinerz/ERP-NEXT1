import { Module } from '@nestjs/common';
import { IpamController } from './ipam.controller';
import { IpamService } from './ipam.service';

// IPAM — pencatatan IP publik NEXT1 (blok, rencana zona, alokasi, karantina)
@Module({
  controllers: [IpamController],
  providers: [IpamService],
})
export class IpamModule {}
