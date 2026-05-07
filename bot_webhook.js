// ==========================================
// INCES BOT - FINAL WEBHOOK SERVER VERSION
// Aman untuk isi Google Sheet dengan karakter _ * < > &
// ==========================================

const express = require("express");
const bodyParser = require("body-parser");
const { google } = require("googleapis");
const TelegramBot = require("node-telegram-bot-api");

// === ENV VARIABEL (Render) ===
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const SHEET_NAME = process.env.SHEET_NAME;
const GOOGLE_CREDENTIALS = JSON.parse(process.env.GOOGLE_CREDENTIALS);
const PORT = process.env.PORT || 10000;

// === Inisialisasi Telegram Bot TANPA POLLING ===
const bot = new TelegramBot(TELEGRAM_TOKEN);
const app = express();

app.use(bodyParser.json());

// === Escape HTML agar aman untuk Telegram parse_mode HTML ===
function escapeHTML(text = "") {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// === Koneksi ke Google Sheets ===
async function authorize() {
  const auth = new google.auth.GoogleAuth({
    credentials: GOOGLE_CREDENTIALS,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });

  return auth.getClient();
}

async function getSheetData() {
  const authClient = await authorize();
  const sheets = google.sheets({ version: "v4", auth: authClient });

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!A1:C100`,
  });

  return response.data.values || [];
}

async function getDataByCommand(command) {
  try {
    const rows = await getSheetData();

    const foundRow = rows.find(
      (row) => row[0] && row[0].toLowerCase() === `/${command}`.toLowerCase()
    );

    if (!foundRow) {
      return `❌ Tidak ditemukan data untuk perintah <b>${escapeHTML(command)}</b>`;
    }

    const dataText = escapeHTML(foundRow[1] || "(kosong)");
    const note = foundRow[2]
      ? `\n📝 Catatan: ${escapeHTML(foundRow[2])}`
      : "";

    return `📄 <b>${escapeHTML(command.toUpperCase())}</b>\n\n${dataText}${note}`;
  } catch (err) {
    console.error("❌ ERROR getDataByCommand:", err.message);
    return "⚠️ Terjadi kesalahan saat mengambil data dari Google Sheets.";
  }
}

// === HANDLER WEBHOOK ===
app.post(`/webhook/${TELEGRAM_TOKEN}`, async (req, res) => {
  try {
    const message = req.body.message;

    if (!message || !message.text) {
      return res.sendStatus(200);
    }

    const chatId = message.chat.id;
    const text = message.text.trim().toLowerCase();

    if (text === "/start") {
      await bot.sendMessage(
        chatId,
        `👋 Halo ${escapeHTML(message.from.first_name || "teman")}! Ketik /help untuk melihat daftar perintah.`,
        { parse_mode: "HTML" }
      );
    } else if (text === "/help") {
      const rows = await getSheetData();

      const commands = rows
        .filter((row) => row[0] && row[0].startsWith("/"))
        .map((row) => row[0])
        .join("\n");

      await bot.sendMessage(
        chatId,
        `📘 <b>Daftar Perintah:</b>\n${escapeHTML(commands || "Belum ada perintah.")}`,
        { parse_mode: "HTML" }
      );
    } else if (text.startsWith("/")) {
      const command = text.slice(1);
      const data = await getDataByCommand(command);

      await bot.sendMessage(chatId, data, {
        parse_mode: "HTML",
      });
    }

    return res.sendStatus(200);
  } catch (err) {
    console.error("❌ ERROR webhook handler:", err.message);
    return res.sendStatus(200);
  }
});

// === Set Webhook ===
(async () => {
  try {
    const webhookUrl = `https://${process.env.RENDER_EXTERNAL_HOSTNAME}/webhook/${TELEGRAM_TOKEN}`;

    await bot.setWebHook(webhookUrl);

    console.log(`✅ Webhook bot aktif di: ${webhookUrl}`);
  } catch (err) {
    console.error("❌ Gagal set webhook:", err.message);
  }
})();

// === Jalankan Server ===
app.listen(PORT, () => {
  console.log(`🚀 Server berjalan di port ${PORT}`);
});
