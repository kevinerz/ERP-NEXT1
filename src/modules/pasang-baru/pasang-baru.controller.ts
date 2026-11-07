import {
  Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Put, Query, UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { BaDataDto, BaDto, BaScanDto, CatatanDto, DokumenDto, FotoLinkDto, LinkDto, NetworkDto, PerangkatDto, RequestPerangkatDto, OrderOpsDto, OrderSalesDto, PutusanDto, SphDto, SurveyDto, SurveyOpsDto, SurveyTeknisDto } from './dto';
import { PasangBaruService, Pengguna } from './pasang-baru.service';
import { KurirApiService } from './kurir-api.service';

// Akses modul: sales / operations / instalasi / finance (lihat ModulAksesGuard); hak ubah per tahap dicek di service
@Controller('pasang-baru')
export class PasangBaruController {
  constructor(private readonly svc: PasangBaruService, private readonly kurirApi: KurirApiService) {}

  @Get('referensi') referensi() { return this.svc.referensi(); }
  @Get('pelanggan') cariPelanggan(@Query('q') q: string) { return this.svc.cariPelanggan(q); }
  @Get('ringkas') ringkas(@CurrentUser() u: Pengguna, @Query() q: { saya?: string }) { return this.svc.ringkas(u, q); }

  // Survey (tahap pertama, sebelum SPH)
  @Get('survey') daftarSurvey(@CurrentUser() u: Pengguna, @Query() q: { status?: string; cari?: string; saya?: string }) { return this.svc.daftarSurvey(q, u); }
  @Get('survey/:id') detailSurvey(@CurrentUser() u: Pengguna, @Param('id', ParseIntPipe) id: number) { return this.svc.detailSurvey(id, u); }
  @Post('survey') buatSurvey(@CurrentUser() u: Pengguna, @Body() dto: SurveyDto) { return this.svc.buatSurvey(u, dto); }
  @Put('survey/:id') ubahSurvey(@CurrentUser() u: Pengguna, @Param('id', ParseIntPipe) id: number, @Body() dto: SurveyDto) {
    return this.svc.ubahSurvey(u, id, dto);
  }
  @Post('survey/:id/ajukan') ajukanSurvey(@CurrentUser() u: Pengguna, @Param('id', ParseIntPipe) id: number, @Body() dto: CatatanDto) {
    return this.svc.ajukanSurvey(u, id, dto);
  }
  @Put('survey/:id/ops') simpanOps(@CurrentUser() u: Pengguna, @Param('id', ParseIntPipe) id: number, @Body() dto: SurveyOpsDto) {
    return this.svc.simpanOpsSurvey(u, id, dto);
  }
  @Post('survey/:id/kirim-teknis') kirimTeknis(@CurrentUser() u: Pengguna, @Param('id', ParseIntPipe) id: number, @Body() dto: CatatanDto) {
    return this.svc.kirimTeknisSurvey(u, id, dto);
  }
  @Put('survey/:id/teknis') simpanTeknis(@CurrentUser() u: Pengguna, @Param('id', ParseIntPipe) id: number, @Body() dto: SurveyTeknisDto) {
    return this.svc.simpanTeknisSurvey(u, id, dto);
  }
  @Post('survey/:id/teknis-selesai') teknisSelesai(@CurrentUser() u: Pengguna, @Param('id', ParseIntPipe) id: number, @Body() dto: CatatanDto) {
    return this.svc.selesaiTeknisSurvey(u, id, dto);
  }
  @Post('survey/:id/ops-selesai') opsSelesai(@CurrentUser() u: Pengguna, @Param('id', ParseIntPipe) id: number, @Body() dto: CatatanDto) {
    return this.svc.selesaiOpsSurvey(u, id, dto);
  }
  @Post('survey/:id/kembalikan') kembalikanSurvey(@CurrentUser() u: Pengguna, @Param('id', ParseIntPipe) id: number, @Body() dto: CatatanDto) {
    return this.svc.kembalikanSurvey(u, id, dto);
  }
  @Post('survey/:id/batal') batalSurvey(@CurrentUser() u: Pengguna, @Param('id', ParseIntPipe) id: number, @Body() dto: CatatanDto) {
    return this.svc.batalSurvey(u, id, dto);
  }
  @Post('survey/:id/aktifkan') aktifkanSurvey(@CurrentUser() u: Pengguna, @Param('id', ParseIntPipe) id: number) {
    return this.svc.aktifkanSurvey(u, id);
  }
  @Delete('survey/:id') hapusSurvey(@CurrentUser() u: Pengguna, @Param('id', ParseIntPipe) id: number) { return this.svc.hapusSurvey(u, id); }

  // SPH
  @Get('sph') daftarSph(@CurrentUser() u: Pengguna, @Query() q: { status?: string; cari?: string; saya?: string }) { return this.svc.daftarSph(q, u); }
  @Get('sph/:id') detailSph(@Param('id', ParseIntPipe) id: number) { return this.svc.detailSph(id); }
  @Post('sph') buatSph(@CurrentUser() u: Pengguna, @Body() dto: SphDto) { return this.svc.buatSph(u, dto); }
  @Put('sph/:id') ubahSph(@CurrentUser() u: Pengguna, @Param('id', ParseIntPipe) id: number, @Body() dto: SphDto) {
    return this.svc.ubahSph(u, id, dto);
  }
  @Delete('sph/:id') hapusSph(@CurrentUser() u: Pengguna, @Param('id', ParseIntPipe) id: number) { return this.svc.hapusSph(u, id); }
  @Delete('sph/:id/permanen') hapusPermanen(@CurrentUser() u: Pengguna, @Param('id', ParseIntPipe) id: number) {
    return this.svc.hapusPermanenSph(u, id);
  }
  @Post('sph/:id/ajukan') ajukan(@CurrentUser() u: Pengguna, @Param('id', ParseIntPipe) id: number) { return this.svc.ajukanSph(u, id); }
  @Post('sph/:id/putuskan') putuskan(@CurrentUser() u: Pengguna, @Param('id', ParseIntPipe) id: number, @Body() dto: PutusanDto) {
    return this.svc.putuskanSph(u, id, dto);
  }

  // Order PB
  @Get('order') daftarOrder(@CurrentUser() u: Pengguna, @Query() q: { tahap?: string; cari?: string; id_sph?: string; saya?: string }) { return this.svc.daftarOrder(q, u); }
  @Get('order/:id') detailOrder(@CurrentUser() u: Pengguna, @Param('id', ParseIntPipe) id: number) { return this.svc.detailOrder(u, id); }
  @Patch('order/:id/sales') ubahSales(@CurrentUser() u: Pengguna, @Param('id', ParseIntPipe) id: number, @Body() dto: OrderSalesDto) {
    return this.svc.ubahSales(u, id, dto);
  }
  @Patch('order/:id/ops') ubahOps(@CurrentUser() u: Pengguna, @Param('id', ParseIntPipe) id: number, @Body() dto: OrderOpsDto) {
    return this.svc.ubahOps(u, id, dto);
  }
  @Post('order/:id/link') tambahLink(@CurrentUser() u: Pengguna, @Param('id', ParseIntPipe) id: number, @Body() dto: LinkDto) {
    return this.svc.tambahLink(u, id, dto);
  }
  @Patch('link/:id') ubahLink(@CurrentUser() u: Pengguna, @Param('id', ParseIntPipe) id: number, @Body() dto: LinkDto) {
    return this.svc.ubahLink(u, id, dto);
  }
  @Post('link/:id/foto')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 15 * 1024 * 1024 } }))
  unggahFotoLink(@CurrentUser() u: Pengguna, @Param('id', ParseIntPipe) id: number, @Body() dto: FotoLinkDto, @UploadedFile() file: any) {
    return this.svc.unggahFotoLink(u, id, dto, file);
  }
  @Delete('link/:id') hapusLink(@CurrentUser() u: Pengguna, @Param('id', ParseIntPipe) id: number) { return this.svc.hapusLink(u, id); }

  @Post('order/:id/dokumen')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 15 * 1024 * 1024 } }))
  unggah(@CurrentUser() u: Pengguna, @Param('id', ParseIntPipe) id: number, @Body() dto: DokumenDto, @UploadedFile() file: any) {
    return this.svc.unggahDokumen(u, id, dto, file);
  }
  @Delete('dokumen/:id') hapusDokumen(@CurrentUser() u: Pengguna, @Param('id', ParseIntPipe) id: number) { return this.svc.hapusDokumen(u, id); }

  // Tahap Network
  @Get('stok') stok(@Query() q: { cari?: string }) { return this.svc.stokPerangkat(q); }
  @Post('order/:id/perangkat') ambilPerangkat(@CurrentUser() u: Pengguna, @Param('id', ParseIntPipe) id: number, @Body() dto: PerangkatDto) {
    return this.svc.ambilPerangkat(u, id, dto);
  }
  @Post('order/:id/perangkat/request') requestPerangkat(@CurrentUser() u: Pengguna, @Param('id', ParseIntPipe) id: number, @Body() dto: RequestPerangkatDto) {
    return this.svc.requestPerangkat(u, id, dto);
  }
  @Delete('perangkat/:id') lepasPerangkat(@CurrentUser() u: Pengguna, @Param('id', ParseIntPipe) id: number) { return this.svc.lepasPerangkat(u, id); }
  @Post('perangkat/:id/pakai') pakaiHasil(@CurrentUser() u: Pengguna, @Param('id', ParseIntPipe) id: number) { return this.svc.pakaiHasilRequest(u, id); }
  @Put('order/:id/network') simpanNetwork(@CurrentUser() u: Pengguna, @Param('id', ParseIntPipe) id: number, @Body() dto: NetworkDto) {
    return this.svc.simpanNetwork(u, id, dto);
  }
  @Get('kontak-teknisi') kontakTeknisi() { return this.svc.daftarKontakTeknisi(); }
  @Get('kurir') kurir() { return this.svc.daftarKurir(); }
  // Kurir api.co.id: referensi gratis, cek ongkir Rp 5, order memotong saldo, lacak gratis
  @Get('kurir-api/saldo') kurirSaldo() { return this.kurirApi.saldo(); }
  @Get('kurir-api/provinsi') kurirProvinsi() { return this.kurirApi.provinsi(); }
  @Get('kurir-api/kota') kurirKota(@Query('province') p: string) { return this.kurirApi.kota(p); }
  @Get('kurir-api/kecamatan') kurirKecamatan(@Query('city') c: string) { return this.kurirApi.kecamatan(c); }
  @Get('kurir-api/alamat') kurirAlamat() { return this.kurirApi.alamat(); }
  @Post('kurir-api/alamat') kurirBuatAlamat(@CurrentUser() u: Pengguna, @Body() dto: Record<string, unknown>) { return this.kurirApi.buatAlamat(u, dto); }
  @Get('order/:id/kurir-api/ongkir') kurirOngkir(@CurrentUser() u: Pengguna, @Param('id', ParseIntPipe) id: number, @Query() q: Record<string, unknown>) {
    return this.kurirApi.ongkir(u, id, q);
  }
  @Post('order/:id/kurir-api/pesan') kurirPesan(@CurrentUser() u: Pengguna, @Param('id', ParseIntPipe) id: number, @Body() dto: Record<string, unknown>) {
    return this.kurirApi.pesan(u, id, dto);
  }
  @Post('order/:id/kurir-api/lacak') kurirLacak(@Param('id', ParseIntPipe) id: number) { return this.kurirApi.lacak(id); }
  @Post('order/:id/kurir-api/batal') kurirBatal(@CurrentUser() u: Pengguna, @Param('id', ParseIntPipe) id: number) { return this.kurirApi.batal(u, id); }
  @Post('order/:id/wa-teknisi') waTeknisi(@CurrentUser() u: Pengguna, @Param('id', ParseIntPipe) id: number) { return this.svc.kirimWaTeknisi(u, id); }
  @Post('order/:id/pemasangan-selesai') pemasanganSelesai(@CurrentUser() u: Pengguna, @Param('id', ParseIntPipe) id: number, @Body() dto: CatatanDto) {
    return this.svc.selesaiPemasangan(u, id, dto);
  }
  @Put('order/:id/ba-data') baData(@CurrentUser() u: Pengguna, @Param('id', ParseIntPipe) id: number, @Body() dto: BaDataDto) {
    return this.svc.simpanBaData(u, id, dto);
  }
  @Post('order/:id/ba-nomor') baNomor(@CurrentUser() u: Pengguna, @Param('id', ParseIntPipe) id: number) { return this.svc.nomorBaOrder(u, id); }
  @Post('order/:id/ba-scan')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 15 * 1024 * 1024 } }))
  baScan(@CurrentUser() u: Pengguna, @Param('id', ParseIntPipe) id: number, @Body() dto: BaScanDto, @UploadedFile() file: any) {
    return this.svc.unggahBaScan(u, id, dto, file);
  }
  @Post('order/:id/ba') tandaTanganBa(@CurrentUser() u: Pengguna, @Param('id', ParseIntPipe) id: number, @Body() dto: BaDto) {
    return this.svc.tandaTanganBa(u, id, dto);
  }

  @Post('order/:id/serahkan') serahkan(@CurrentUser() u: Pengguna, @Param('id', ParseIntPipe) id: number, @Body() dto: CatatanDto) {
    return this.svc.serahkan(u, id, dto);
  }
  @Post('order/:id/kembalikan') kembalikan(@CurrentUser() u: Pengguna, @Param('id', ParseIntPipe) id: number, @Body() dto: CatatanDto) {
    return this.svc.kembalikan(u, id, dto);
  }
  @Post('order/:id/batal') batal(@CurrentUser() u: Pengguna, @Param('id', ParseIntPipe) id: number, @Body() dto: CatatanDto) {
    return this.svc.batal(u, id, dto);
  }
}
