import { initAuthCreds, BufferJSON, proto } from '@whiskeysockets/baileys';
import type { AuthenticationState, SignalDataTypeMap } from '@whiskeysockets/baileys';
import { PrismaService } from '../../../prisma/prisma.service';

/**
 * Adapter auth state Baileys yang menyimpan sesi login WA ke DB (bukan
 * folder file lokal seperti useMultiFileAuthState bawaan) — supaya sesi
 * tidak hilang / perlu scan ulang QR tiap kali server di-deploy ulang
 * (deploy git di server ini mengganti seluruh folder aplikasi).
 */
export async function usePrismaAuthState(prisma: PrismaService): Promise<{
  state: AuthenticationState;
  saveCreds: () => Promise<void>;
}> {
  const writeKey = async (category: string, id: string, data: any) => {
    await prisma.whatsappAuthKey.upsert({
      where: { category_key_id: { category, key_id: id } },
      create: { category, key_id: id, value_json: JSON.stringify(data, BufferJSON.replacer) },
      update: { value_json: JSON.stringify(data, BufferJSON.replacer) },
    });
  };
  const readKey = async (category: string, id: string) => {
    const row = await prisma.whatsappAuthKey.findUnique({ where: { category_key_id: { category, key_id: id } } });
    if (!row?.value_json) return null;
    return JSON.parse(row.value_json, BufferJSON.reviver);
  };
  const removeKey = async (category: string, id: string) => {
    await prisma.whatsappAuthKey.deleteMany({ where: { category, key_id: id } });
  };

  const credsRow = await prisma.whatsappAuthCreds.findUnique({ where: { id: 1 } });
  const creds = credsRow ? JSON.parse(credsRow.creds_json, BufferJSON.reviver) : initAuthCreds();

  return {
    state: {
      creds,
      keys: {
        get: async (type, ids: string[]) => {
          const data: { [id: string]: any } = {};
          await Promise.all(
            ids.map(async (id) => {
              let value = await readKey(type, id);
              if (type === 'app-state-sync-key' && value) {
                value = proto.Message.AppStateSyncKeyData.fromObject(value);
              }
              data[id] = value;
            }),
          );
          return data as { [id: string]: SignalDataTypeMap[typeof type] };
        },
        set: async (data) => {
          const tasks: Promise<void>[] = [];
          for (const category in data) {
            for (const id in (data as any)[category]) {
              const value = (data as any)[category][id];
              tasks.push(value ? writeKey(category, id, value) : removeKey(category, id));
            }
          }
          await Promise.all(tasks);
        },
      },
    },
    saveCreds: async () => {
      await prisma.whatsappAuthCreds.upsert({
        where: { id: 1 },
        create: { id: 1, creds_json: JSON.stringify(creds, BufferJSON.replacer) },
        update: { creds_json: JSON.stringify(creds, BufferJSON.replacer) },
      });
    },
  };
}

/** Hapus semua sesi tersimpan — dipakai saat user "Putuskan" koneksi WA */
export async function clearAuthState(prisma: PrismaService): Promise<void> {
  await prisma.whatsappAuthKey.deleteMany({});
  await prisma.whatsappAuthCreds.deleteMany({});
}
