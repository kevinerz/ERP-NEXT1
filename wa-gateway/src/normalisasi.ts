// Ubah WAMessage (proto Baileys) menjadi payload sederhana untuk ERP
import { getContentType, normalizeMessageContent, isJidGroup, type WAMessage, type proto } from 'baileys';

export type JenisMedia = 'image' | 'video' | 'audio' | 'document' | 'sticker';

export interface InfoMedia {
  jenis: JenisMedia;
  mimetype: string | null;
  nama_file: string | null;
  ukuran: number | null;
  durasi: number | null;
  ptt: boolean; // voice note
  file: string | null; // nama file di gateway (GET /akun/:akun/media/:file); null = belum/tidak diunduh
}

export interface PayloadPesan {
  id: string;
  chat_jid: string; // JID kanonik (nomor HP bila diketahui, selain itu LID / grup)
  chat_lid: string | null;
  is_grup: boolean;
  dari_saya: boolean;
  pengirim_jid: string | null; // di grup: anggota pengirim; di chat pribadi: lawan bicara / null bila dari saya
  pengirim_lid: string | null;
  nama_pengirim: string | null; // pushName
  waktu: number; // detik epoch
  tipe: string; // text | image | video | audio | document | sticker | location | contact | reaction | revoke | edit | poll | call | unsupported
  teks: string | null;
  media: InfoMedia | null;
  kutipan: { id: string; pengirim_jid: string | null; teks: string | null } | null;
  lokasi: { lat: number; lng: number; nama: string | null; alamat: string | null } | null;
  kontak: { nama: string | null; vcard: string | null }[] | null;
  reaksi: { target_id: string; emoji: string } | null;
  target_id: string | null; // untuk revoke / edit
  status: number | null; // 0 error, 1 pending, 2 server, 3 terkirim, 4 dibaca, 5 diputar
  riwayat: boolean;
}

const MEDIA: Record<string, JenisMedia> = {
  imageMessage: 'image',
  videoMessage: 'video',
  ptvMessage: 'video',
  audioMessage: 'audio',
  documentMessage: 'document',
  stickerMessage: 'sticker',
};

// Ambil teks yang bisa ditampilkan dari isi pesan (dipakai juga untuk kutipan)
export function teksDari(m: proto.IMessage | null | undefined): string | null {
  const c = normalizeMessageContent(m);
  if (!c) return null;
  return (
    c.conversation ||
    c.extendedTextMessage?.text ||
    c.imageMessage?.caption ||
    c.videoMessage?.caption ||
    c.documentMessage?.caption ||
    c.buttonsResponseMessage?.selectedDisplayText ||
    c.listResponseMessage?.title ||
    c.templateButtonReplyMessage?.selectedDisplayText ||
    c.pollCreationMessage?.name ||
    c.pollCreationMessageV3?.name ||
    c.locationMessage?.name ||
    null
  );
}

export function isMedia(p: PayloadPesan) {
  return !!p.media;
}

// resolve: ubah LID → JID nomor HP bila pemetaannya diketahui
export async function normalisasi(
  msg: WAMessage,
  resolve: (jid: string | null | undefined, alt?: string | null) => Promise<{ jid: string | null; lid: string | null }>,
  riwayat = false,
): Promise<PayloadPesan | null> {
  const key = msg.key;
  if (!key?.id || !key.remoteJid) return null;
  if (key.remoteJid === 'status@broadcast' || key.remoteJid.endsWith('@newsletter') || key.remoteJid.endsWith('@broadcast')) return null;

  const content = normalizeMessageContent(msg.message);
  // Pesan sistem (anggota grup masuk/keluar, enkripsi, dll) tidak punya isi → lewati
  if (!content) return null;
  const jenis = getContentType(content);
  if (!jenis || jenis === 'senderKeyDistributionMessage' || jenis === 'messageContextInfo') return null;

  const isGrup = !!isJidGroup(key.remoteJid);
  const chat = isGrup ? { jid: key.remoteJid, lid: null } : await resolve(key.remoteJid, key.remoteJidAlt);
  const pengirim = isGrup
    ? await resolve(key.participant, key.participantAlt)
    : key.fromMe
      ? { jid: null, lid: null }
      : chat;

  const inner: any = (content as any)[jenis];
  const ctx: proto.IContextInfo | null | undefined = inner?.contextInfo;

  const p: PayloadPesan = {
    id: key.id,
    chat_jid: chat.jid ?? key.remoteJid,
    chat_lid: chat.lid,
    is_grup: isGrup,
    dari_saya: !!key.fromMe,
    pengirim_jid: pengirim.jid,
    pengirim_lid: pengirim.lid,
    nama_pengirim: key.fromMe ? null : msg.pushName || null,
    waktu: Number(msg.messageTimestamp ?? Math.floor(Date.now() / 1000)),
    tipe: 'unsupported',
    teks: null,
    media: null,
    kutipan: null,
    lokasi: null,
    kontak: null,
    reaksi: null,
    target_id: null,
    status: msg.status ?? null,
    riwayat,
  };

  if (ctx?.stanzaId) {
    const q = ctx.participant ? await resolve(ctx.participant) : { jid: null, lid: null };
    p.kutipan = { id: ctx.stanzaId, pengirim_jid: q.jid ?? ctx.participant ?? null, teks: teksDari(ctx.quotedMessage) };
  }

  if (jenis === 'conversation' || jenis === 'extendedTextMessage') {
    p.tipe = 'text';
    p.teks = teksDari(content);
  } else if (MEDIA[jenis]) {
    p.tipe = MEDIA[jenis];
    p.teks = inner?.caption || null;
    p.media = {
      jenis: MEDIA[jenis],
      mimetype: inner?.mimetype ?? null,
      nama_file: inner?.fileName ?? null,
      ukuran: inner?.fileLength != null ? Number(inner.fileLength) : null,
      durasi: inner?.seconds ?? null,
      ptt: !!inner?.ptt,
      file: null,
    };
  } else if (jenis === 'locationMessage' || jenis === 'liveLocationMessage') {
    p.tipe = 'location';
    p.lokasi = { lat: inner?.degreesLatitude ?? 0, lng: inner?.degreesLongitude ?? 0, nama: inner?.name ?? null, alamat: inner?.address ?? null };
    p.teks = inner?.name ?? inner?.caption ?? null;
  } else if (jenis === 'contactMessage') {
    p.tipe = 'contact';
    p.kontak = [{ nama: inner?.displayName ?? null, vcard: inner?.vcard ?? null }];
  } else if (jenis === 'contactsArrayMessage') {
    p.tipe = 'contact';
    p.kontak = (inner?.contacts ?? []).map((c: any) => ({ nama: c?.displayName ?? null, vcard: c?.vcard ?? null }));
  } else if (jenis === 'reactionMessage') {
    p.tipe = 'reaction';
    p.reaksi = { target_id: inner?.key?.id ?? '', emoji: inner?.text ?? '' };
  } else if (jenis === 'protocolMessage') {
    // 0 = REVOKE (pesan dihapus), 14 = MESSAGE_EDIT
    if (inner?.type === 0) {
      p.tipe = 'revoke';
      p.target_id = inner?.key?.id ?? null;
    } else if (inner?.type === 14) {
      p.tipe = 'edit';
      p.target_id = inner?.key?.id ?? null;
      p.teks = teksDari(inner?.editedMessage);
    } else {
      return null; // protocol lain (sinkron kunci, ephemeral setting, dll)
    }
  } else if (jenis === 'editedMessage') {
    const pm = inner?.message?.protocolMessage;
    p.tipe = 'edit';
    p.target_id = pm?.key?.id ?? null;
    p.teks = teksDari(pm?.editedMessage);
  } else if (jenis.startsWith('pollCreationMessage')) {
    p.tipe = 'poll';
    p.teks = inner?.name ?? null;
  } else if (jenis === 'pollUpdateMessage') {
    return null; // suara polling terenkripsi — lewati
  } else if (
    jenis === 'buttonsResponseMessage' ||
    jenis === 'listResponseMessage' ||
    jenis === 'templateButtonReplyMessage'
  ) {
    p.tipe = 'text';
    p.teks = teksDari(content);
  } else {
    p.tipe = 'unsupported';
    p.teks = `[${jenis}]`;
  }
  return p;
}
