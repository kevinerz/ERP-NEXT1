import pino from 'pino';

// Log gateway sendiri (dibaca lewat `pm2 logs wa-gateway`)
export const log = pino({ level: process.env.LOG_LEVEL || 'info', base: undefined, timestamp: pino.stdTimeFunctions.isoTime });
// Log internal Baileys sangat ramai — cukup peringatan ke atas
export const logBaileys = pino({ level: process.env.BAILEYS_LOG_LEVEL || 'warn', base: undefined });
