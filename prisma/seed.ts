// Prisma Seed Script — ERP NEXT1
// Jalankan: npx prisma db seed
// Isi: roles, user admin, master_layanan, master_vendor_isp

import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database ERP NEXT1...\n');

  // ============================================================
  // 1. CORE ROLES
  // ============================================================
  console.log('→ Membuat roles...');
  const roles = [
    { nama_role: 'Director',          deskripsi: 'Direktur — akses penuh' },
    { nama_role: 'Manager_Ops',       deskripsi: 'Manager Operasional' },
    { nama_role: 'Sales',             deskripsi: 'Tim Sales' },
    { nama_role: 'Teknisi',           deskripsi: 'Teknisi Lapangan' },
    { nama_role: 'Finance',           deskripsi: 'Finance & Billing' },
    { nama_role: 'HRD',               deskripsi: 'Human Resource' },
    { nama_role: 'Admin',             deskripsi: 'Admin Sistem — akses penuh' },
  ];

  for (const role of roles) {
    await prisma.coreRole.upsert({
      where: { nama_role: role.nama_role },
      update: {},
      create: role,
    });
  }
  console.log(`   ✓ ${roles.length} roles`);

  // ============================================================
  // 2. KARYAWAN & USER ADMIN
  // ============================================================
  console.log('→ Membuat user admin...');

  const adminKaryawan = await prisma.hrisKaryawan.upsert({
    where: { nip: 'N1-001' },
    update: {},
    create: {
      nip:          'N1-001',
      nama_lengkap: 'Administrator',
      jabatan:      'System Administrator',
      departemen:   'IT_Internal',
      email:        'admin@nextone.id',
      status_aktif: true,
    },
  });

  const passwordHash = await bcrypt.hash('Next1@2026!', 12);

  const adminUser = await prisma.coreUser.upsert({
    where: { username: 'admin' },
    update: {},
    create: {
      id_karyawan:   adminKaryawan.id_karyawan,
      username:      'admin',
      password_hash: passwordHash,
      is_aktif:      true,
    },
  });

  // Assign role Admin
  const adminRole = await prisma.coreRole.findUnique({ where: { nama_role: 'Admin' } });
  await prisma.coreUserRole.upsert({
    where: { id_user_id_role: { id_user: adminUser.id_user, id_role: adminRole.id_role } },
    update: {},
    create: { id_user: adminUser.id_user, id_role: adminRole.id_role },
  });

  console.log('   ✓ User admin dibuat');
  console.log('   Username : admin');
  console.log('   Password : Next1@2026!');
  console.log('   ⚠️  Ganti password setelah login pertama!\n');

  // ============================================================
  // 3. MASTER LAYANAN
  // ============================================================
  console.log('→ Membuat master layanan...');
  const layanan = [
    { kode_layanan: 'FO',           nama_layanan: 'FO',               is_managed: true },
    { kode_layanan: 'M2M',          nama_layanan: 'M2M',              is_managed: true },
    { kode_layanan: 'STARLINK',     nama_layanan: 'Starlink',         is_managed: true },
    { kode_layanan: 'DUAL_FO',      nama_layanan: 'Dual FO',          is_managed: true },
    { kode_layanan: 'DUAL_M2M',     nama_layanan: 'Dual M2M',         is_managed: true },
    { kode_layanan: 'M2M_STARLINK', nama_layanan: 'M2M + Starlink',   is_managed: true },
    { kode_layanan: 'TRIPLE_M2M',   nama_layanan: 'Triple M2M',       is_managed: true },
    { kode_layanan: 'FO_DUAL_TLPN', nama_layanan: 'FO + Dual TLPN',   is_managed: true },
    { kode_layanan: 'DED_FO',       nama_layanan: 'Dedicated FO',     is_managed: true },
    { kode_layanan: 'WIRELESS',     nama_layanan: 'Wireless',         is_managed: false },
    { kode_layanan: 'CUSTOM',       nama_layanan: 'Custom',           is_managed: true },
    { kode_layanan: 'ACCESS_POINT', nama_layanan: 'Access Point',     is_managed: true },
  ];

  for (const l of layanan) {
    await prisma.masterLayanan.upsert({
      where: { kode_layanan: l.kode_layanan },
      update: {},
      create: l,
    });
  }
  console.log(`   ✓ ${layanan.length} layanan`);

  // ============================================================
  // 4. MASTER VENDOR ISP
  // ============================================================
  console.log('→ Membuat master vendor ISP...');
  const vendors = [
    // ISP (50 vendor)
    { nama_vendor: 'HYPERNET',           tipe_vendor: 'ISP' },
    { nama_vendor: 'MORATEL / OXYGEN',   tipe_vendor: 'ISP' },
    { nama_vendor: 'CBN',                tipe_vendor: 'ISP' },
    { nama_vendor: 'Firstmedia',         tipe_vendor: 'ISP' },
    { nama_vendor: 'LINKNET',            tipe_vendor: 'ISP' },
    { nama_vendor: 'ICONNET',            tipe_vendor: 'ISP' },
    { nama_vendor: 'Winter Access',      tipe_vendor: 'ISP' },
    { nama_vendor: 'JUJUNGNET',          tipe_vendor: 'ISP' },
    { nama_vendor: 'Victorynet',         tipe_vendor: 'ISP' },
    { nama_vendor: 'DIJ',                tipe_vendor: 'ISP' },
    { nama_vendor: 'MyRepublic',         tipe_vendor: 'ISP' },
    { nama_vendor: 'Centrin',            tipe_vendor: 'ISP' },
    { nama_vendor: 'Jala Lintas Media',  tipe_vendor: 'ISP' },
    { nama_vendor: 'AMC',                tipe_vendor: 'ISP' },
    { nama_vendor: 'Starlink',           tipe_vendor: 'ISP' },
    { nama_vendor: 'INET GLOBAL INDO',   tipe_vendor: 'ISP' },
    { nama_vendor: 'NEUVIS',             tipe_vendor: 'ISP' },
    { nama_vendor: 'Wownet',             tipe_vendor: 'ISP' },
    { nama_vendor: 'IP One',             tipe_vendor: 'ISP' },
    { nama_vendor: 'QNET / Arkadata',    tipe_vendor: 'ISP' },
    { nama_vendor: 'NETCITI',            tipe_vendor: 'ISP' },
    { nama_vendor: 'DNA Net',            tipe_vendor: 'ISP' },
    { nama_vendor: 'Timoer Net',         tipe_vendor: 'ISP' },
    { nama_vendor: 'WANXP',              tipe_vendor: 'ISP' },
    { nama_vendor: 'SOLNET',             tipe_vendor: 'ISP' },
    { nama_vendor: 'Mnet',               tipe_vendor: 'ISP' },
    { nama_vendor: 'PDT',                tipe_vendor: 'ISP' },
    { nama_vendor: 'Transnet',           tipe_vendor: 'ISP' },
    { nama_vendor: 'Envision',           tipe_vendor: 'ISP' },
    { nama_vendor: 'TBG',                tipe_vendor: 'ISP' },
    { nama_vendor: 'Maxindo',            tipe_vendor: 'ISP' },
    { nama_vendor: 'JTOWN',              tipe_vendor: 'ISP' },
    { nama_vendor: 'FIBERNET',           tipe_vendor: 'ISP' },
    { nama_vendor: 'NEXA',               tipe_vendor: 'ISP' },
    { nama_vendor: 'Balifiber',          tipe_vendor: 'ISP' },
    { nama_vendor: 'Primelink',          tipe_vendor: 'ISP' },
    { nama_vendor: 'IDEANET',            tipe_vendor: 'ISP' },
    { nama_vendor: 'E-talk',             tipe_vendor: 'ISP' },
    { nama_vendor: 'ZUM STAR',           tipe_vendor: 'ISP' },
    { nama_vendor: 'Varnion',            tipe_vendor: 'ISP' },
    { nama_vendor: 'SUNVONE / OPTINET',  tipe_vendor: 'ISP' },
    { nama_vendor: 'MTM',                tipe_vendor: 'ISP' },
    { nama_vendor: 'Prime Net',          tipe_vendor: 'ISP' },
    { nama_vendor: 'TDM',                tipe_vendor: 'ISP' },
    { nama_vendor: 'Astinet',            tipe_vendor: 'ISP' },
    { nama_vendor: 'Nusanet',            tipe_vendor: 'ISP' },
    { nama_vendor: 'Circle One',         tipe_vendor: 'ISP' },
    { nama_vendor: 'Integrasia',         tipe_vendor: 'ISP' },
    { nama_vendor: 'Akses Prima',        tipe_vendor: 'ISP' },
    { nama_vendor: 'DUKODU',             tipe_vendor: 'ISP' },
    // Mobile Operator
    { nama_vendor: 'Telkomsel',          tipe_vendor: 'Mobile_Operator' },
    { nama_vendor: 'Indosat Ooredoo',    tipe_vendor: 'Mobile_Operator' },
    { nama_vendor: 'XL Axiata',          tipe_vendor: 'Mobile_Operator' },
    { nama_vendor: 'Smartfren',          tipe_vendor: 'Mobile_Operator' },
    { nama_vendor: 'Tri (3)',            tipe_vendor: 'Mobile_Operator' },
  ];

  for (const v of vendors) {
    await prisma.masterVendorIsp.upsert({
      where: { nama_vendor: v.nama_vendor },
      update: {},
      create: v,
    });
  }
  console.log(`   ✓ ${vendors.length} vendor (50 ISP + 5 operator mobile)`);

  console.log('\n✅ Seeding selesai!\n');
}

main()
  .catch((e) => {
    console.error('❌ Seed gagal:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
