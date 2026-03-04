/*
   ✨ WHATSAPP BOT - THE FINAL MASTERPIECE (NODE v25)
   Primary Admin: 51788732489876@s.whatsapp.net
   Bot Number: 8801845938953
*/

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs-extra';
import { spawn } from 'child_process';
import pino from 'pino';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- ROBUST LIBRARY LOADER ---
const BaileysLib = require('@whiskeysockets/baileys');

const getBaileysFunc = (name) => {
    return BaileysLib[name] || BaileysLib.default?.[name] || BaileysLib.default?.default?.[name] || null;
};

const makeWASocket = getBaileysFunc('default') || BaileysLib.default || BaileysLib;
const useMultiFileAuthState = getBaileysFunc('useMultiFileAuthState');
const fetchLatestBaileysVersion = getBaileysFunc('fetchLatestBaileysVersion');
const makeInMemoryStore = getBaileysFunc('makeInMemoryStore');
const downloadContentFromMessage = getBaileysFunc('downloadContentFromMessage');

const googleTTS = require('google-tts-api');
const yts = require('youtube-search-api');

// --- CONFIG ---
const PHONE_NUMBER = "8801845938953"; 
const PRIMARY_ADMIN = "51788732489876@s.whatsapp.net"; 
const BOT_LID = "8801845938953@lid"; 
const TEMP_DIR = path.join(__dirname, 'temp');
const CACHE_FILE = path.join(__dirname, 'message_cache.json');
fs.ensureDirSync(TEMP_DIR);

// Persistent Message Cache
if (!fs.existsSync(CACHE_FILE)) fs.writeFileSync(CACHE_FILE, JSON.stringify({}));
let messageCache = JSON.parse(fs.readFileSync(CACHE_FILE));
const saveCache = () => {
    const keys = Object.keys(messageCache);
    if (keys.length > 2000) keys.slice(0, keys.length - 2000).forEach(k => delete messageCache[k]);
    fs.writeFileSync(CACHE_FILE, JSON.stringify(messageCache));
};

// Database
const DB_PATH = path.join(__dirname, 'database.json');
if (!fs.existsSync(DB_PATH)) fs.writeFileSync(DB_PATH, JSON.stringify({ banned: {} }));
let db = JSON.parse(fs.readFileSync(DB_PATH));
const saveDb = () => fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));

// Store
const store = typeof makeInMemoryStore === 'function' ? makeInMemoryStore({ logger: pino().child({ level: 'silent' }) }) : { bind: () => {}, loadMessage: () => null };

const activeTasks = new Map();

// --- UTILS ---
const updateStatus = async (sock, from, targetKey, text, per) => {
    const bar = "█".repeat(Math.round(per / 10)) + "░".repeat(10 - Math.round(per / 10));
    const content = `✨ *PREMIUM SYSTEM* ✨\n\n${text}\n[${bar}] ${per}%`;
    try { await sock.sendMessage(from, { text: content, edit: targetKey }); } catch (e) {}
};

// --- CORE DOWNLOADER ---
async function downloadMedia(sock, from, url, isAudio, quoted) {
    if (activeTasks.has(from)) return sock.sendMessage(from, { text: "⚠️ Task running. Use *.stop*" });
    let statusMsg = await sock.sendMessage(from, { text: "⏳ *Initializing...*" }, { quoted });
    let lastUpdate = -10;
    
    try {
        const filename = `${Date.now()}`;
        const ext = isAudio ? 'mp3' : 'mp4';
        const output = path.join(TEMP_DIR, `${filename}.${ext}`);
        
        const args = isAudio
            ? ['-x', '--audio-format', 'mp3', '--audio-quality', '0', '-o', output, url]
            : ['-f', 'bv[ext=mp4][vcodec^=avc1]+ba[ext=m4a]/b[ext=mp4]/b', '--merge-output-format', 'mp4', '-o', output, url];

        const dl = spawn('yt-dlp', [...args, '--newline']);

        dl.stdout.on('data', async (data) => {
            const match = data.toString().match(/(\d+\.\d+)%/);
            if (match) {
                const per = Math.round(parseFloat(match[1]));
                if (per >= lastUpdate + 10 || per === 100) {
                    lastUpdate = per;
                    await updateStatus(sock, from, statusMsg.key, `🚀 *Downloading ${isAudio ? 'MP3' : 'HD Video'}...*`, per);
                }
            }
        });

        dl.on('close', async (code) => {
            activeTasks.delete(from);
            if (code !== 0) return sock.sendMessage(from, { text: "❌ *Failed.*", edit: statusMsg.key });

            await updateStatus(sock, from, statusMsg.key, "🔄 *Optimizing Output...*", 95);
            const finalFile = output;
            const mb = (fs.statSync(finalFile).size) / (1024 * 1024);

            if (isAudio) {
                await sock.sendMessage(from, { audio: fs.readFileSync(finalFile), mimetype: 'audio/mpeg', fileName: `Music.mp3` }, { quoted });
            } else {
                if (mb > 60) {
                    await sock.sendMessage(from, { document: fs.readFileSync(finalFile), mimetype: 'video/mp4', fileName: `HD_Video.mp4`, caption: `✅ *Document Mode (>60MB)*` }, { quoted });
                } else {
                    await sock.sendMessage(from, { video: fs.readFileSync(finalFile), caption: `✅ *HD Quality Delivered*` }, { quoted });
                }
            }
            fs.unlinkSync(finalFile);
            await sock.sendMessage(from, { delete: statusMsg.key });
        });
        activeTasks.set(from, { process: dl, progressKey: statusMsg.key });
    } catch (e) { activeTasks.delete(from); await sock.sendMessage(from, { delete: statusMsg.key }); }
}

// --- MAIN ENGINE ---
async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        auth: state,
        printQRInTerminal: false,
        syncFullHistory: true,
        browser: ["Premium Bot", "Chrome", "20.0.04"],
        getMessage: async (key) => (await store?.loadMessage(key.remoteJid, key.id))?.message || messageCache[key.id]?.message || undefined
    });

    store.bind(sock.ev);
    sock.ev.on('creds.update', saveCreds);
    sock.ev.on('connection.update', (u) => { if (u.connection === 'close') startBot(); if (u.connection === 'open') console.log('🚀 MASTER BOT CONNECTED!'); });

    // --- REFINED TAGGED ANTI-DELETE ---
    const handleRevoke = async (jid, participant, msgObj) => {
        if (participant === PRIMARY_ADMIN || participant === BOT_LID || msgObj.key.fromMe) return;
        await sock.sendMessage(jid, { text: `🚨 *ANTI-DELETE*\n👤 @${participant.split('@')[0]}`, mentions: [participant] });
        await sock.sendMessage(jid, { forward: msgObj });
    };

    sock.ev.on('messages.delete', async (item) => {
        for (const key of item.keys) {
            const cached = messageCache[key.id];
            if (cached) await handleRevoke(key.remoteJid, key.participant || key.remoteJid, cached);
        }
    });

    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.remoteJid === 'status@broadcast') return;

        const from = msg.key.remoteJid;
        const sender = from.endsWith('@g.us') ? msg.key.participant : from;
        const isAd = sender === PRIMARY_ADMIN || sender === BOT_LID || msg.key.fromMe;

        messageCache[msg.key.id] = msg;
        saveCache();

        if (msg.message.protocolMessage && msg.message.protocolMessage.type === 0) {
            const dKey = msg.message.protocolMessage.key.id;
            const cached = messageCache[dKey];
            if (cached) await handleRevoke(from, msg.message.protocolMessage.key.participant || from, cached);
            return;
        }

        const text = msg.message.conversation || msg.message.extendedTextMessage?.text || msg.message.imageMessage?.caption || "";

        // --- AUTO LINK ---
        if (!isAd && !db.banned[sender] && !text.startsWith('.')) {
            const urls = text.match(/(https?:\/\/[^\s]+)/g);
            if (urls && urls[0].match(/(facebook|instagram|tiktok|youtube|youtu\.be)/)) return await downloadMedia(sock, from, urls[0], false, msg);
        }

        if (!text.startsWith('.')) return;
        const command = text.slice(1).trim().split(" ")[0].toLowerCase();
        const args = text.trim().split(" ").slice(1);
        const q = args.join(" ");

        if (db.banned[sender] && !isAd) return;

        // --- COMMAND HANDLER ---
        if (command === 'menu') {
            const menu = `
╭━━━〔 ✨ *PREMIUM* ✨ 〕━━━┈
┃ ✧ .play <song>
┃ ✧ .audio <link/query>
┃ ✧ .yts <query>
┃ ✧ .vv (reply media)
┃ ✧ .tts <text>
┃ ✧ .stop (kill task)
┃ ✧ .ban / .unban
╰━━━━━━━━━━━━━━━━━━┈`;
            await sock.sendMessage(from, { text: menu }, { quoted: msg });
        }

        else if (command === 'play' && q) {
            let s = await sock.sendMessage(from, { text: "🔎 *Searching...*" });
            const res = await yts.GetListByKeyword(q, false, 1);
            await sock.sendMessage(from, { delete: s.key });
            if (res?.items?.length) await downloadMedia(sock, from, `https://youtu.be/${res.items[0].id}`, false, msg);
        }

        else if (command === 'audio' && q) {
            const isLink = q.match(/https?:\/\/[^\s]+/);
            if (isLink) return await downloadMedia(sock, from, q, true, msg);
            const res = await yts.GetListByKeyword(q, false, 1);
            if (res?.items?.length) await downloadMedia(sock, from, `https://youtu.be/${res.items[0].id}`, true, msg);
        }

        else if (command === 'yts' && q) {
            let s = await sock.sendMessage(from, { text: "🔎 *Searching...*" });
            try {
                const res = await yts.GetListByKeyword(q, false, 5);
                let txt = `🔎 *Search:* ${q}\n\n`;
                res.items.forEach((v, i) => txt += `*${i+1}.* ${v.title}\n🔗 youtu.be/${v.id}\n\n`);
                await sock.sendMessage(from, { text: txt }, { quoted: msg });
                await sock.sendMessage(from, { delete: s.key });
            } catch (e) { await sock.sendMessage(from, { text: "❌ Error" }, { edit: s.key }); }
        }

        else if (command === 'tts' && q) {
            let s = await sock.sendMessage(from, { text: "🎙️ *Generating...*" });
            try {
                const url = googleTTS.getAudioUrl(q, { lang: 'en', host: 'https://translate.google.com' });
                await sock.sendMessage(from, { audio: { url }, mimetype: 'audio/mp4', ptt: true }, { quoted: msg });
                await sock.sendMessage(from, { delete: s.key });
            } catch (e) { await sock.sendMessage(from, { text: "❌ Error" }, { edit: s.key }); }
        }

        else if (command === 'vv') {
            const ctx = msg.message.extendedTextMessage?.contextInfo;
            if (!ctx?.stanzaId) return sock.sendMessage(from, { text: "⚠️ Reply to View-Once" });
            let s = await sock.sendMessage(from, { text: "🔓 *Decrypting...*" });
            const target = messageCache[ctx.stanzaId] || await store?.loadMessage(from, ctx.stanzaId);
            const findMedia = (m) => {
                const c = m?.viewOnceMessageV2?.message || m?.viewOnceMessage?.message || m;
                return c?.imageMessage ? { t: 'image', m: c.imageMessage } : c?.videoMessage ? { t: 'video', m: c.videoMessage } : null;
            };
            const media = findMedia(target?.message || ctx.quotedMessage);
            if (media) {
                const stream = await downloadContentFromMessage(media.m, media.t);
                let buf = Buffer.from([]);
                for await (const chunk of stream) buf = Buffer.concat([buf, chunk]);
                await sock.sendMessage(from, { [media.t]: buf, caption: "✅ *Recovered*" }, { quoted: msg });
                await sock.sendMessage(from, { delete: s.key });
            } else await sock.sendMessage(from, { text: "❌ Not found" }, { edit: s.key });
        }

        else if (command === 'stop') {
            if (activeTasks.has(from)) {
                activeTasks.get(from).process.kill();
                const pk = activeTasks.get(from).progressKey;
                activeTasks.delete(from);
                await sock.sendMessage(from, { text: "🛑 *Stopped.*" });
                await sock.sendMessage(from, { delete: pk });
            }
        }

        else if (command === 'ban' && isAd) {
            const ctx = msg.message.extendedTextMessage?.contextInfo;
            let target = ctx?.mentionedJid?.[0] || ctx?.participant || (from.endsWith('@g.us') ? null : from);
            if (target && target !== PRIMARY_ADMIN) { db.banned[target] = true; saveDb(); await sock.sendMessage(from, { text: `✅ Banned.` }); }
        }

        else if (command === 'unban' && isAd) {
            const ctx = msg.message.extendedTextMessage?.contextInfo;
            let target = ctx?.mentionedJid?.[0] || ctx?.participant;
            if (target) { delete db.banned[target]; saveDb(); await sock.sendMessage(from, { text: `✅ Unbanned.` }); }
        }
    });
}

startBot();
