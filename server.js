const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer");
const { createWorker } = require("tesseract.js");
const TelegramBot = require("node-telegram-bot-api");
require("dotenv").config();

const TELEGRAM_CHAT_IDS = String(process.env.TELEGRAM_CHAT_IDS).split(",").map((id) =>
  id.trim()
);

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const bot = new TelegramBot(TOKEN);
const cookies = JSON.parse(fs.readFileSync(process.env.COOKIE_FILE_NAME, "utf-8"));

const LAST_TEXT_PATH = "last_message.txt";
let previousText = fs.existsSync(LAST_TEXT_PATH)
  ? fs.readFileSync(LAST_TEXT_PATH, "utf-8")
  : "";

async function checkAvitoMessages() {
  console.log("🕒 Запуск задачи: проверка Авито...");

const browser = await puppeteer.launch({
  headless: "new",
  args: ['--no-sandbox', '--disable-setuid-sandbox']
});

  const page = await browser.newPage();

  try {
    await page.setViewport({ width: 1280, height: 800 });
    await page.setCookie(...cookies);

    await page.goto("https://www.avito.ru/profile/messenger", {
      waitUntil: "networkidle2",
    });

    const screenshotPath = "avito_messages.png";

    await page.screenshot({
      path: screenshotPath,
      clip: {
        x: 600,
        y: 430,
        width: 500,
        height: 80,
      },
    });

    const stats = fs.statSync(screenshotPath);
    if (!stats.size) throw new Error("Файл скриншота пустой");

    const worker = await createWorker("rus");
    const {
      data: { text },
    } = await worker.recognize(screenshotPath);
    await worker.terminate();

    const cleanedText = text.trim().split("\n")[2];

    if (cleanedText && cleanedText !== previousText) {
      console.log("🔔 Обнаружен новый текст:");
      console.log(cleanedText);

      previousText = cleanedText;
      fs.writeFileSync("last_message.txt", cleanedText);

      for (const id of TELEGRAM_CHAT_IDS) {
        await bot.sendPhoto(id, screenshotPath, {
          caption: `📥 Обнаружено новое сообщение с аккаунта ${process.env.ACCOUNT_OWNER}:\n\n${cleanedText}`,
          contentType: "image/png",
        });
      }
      console.log("✅ Сообщение отправлено в Telegram!");
    }
  } catch (err) {
    console.error("❌ Ошибка:", err.message || err);
  } finally {
    await browser.close();
    const delay = 30000 + Math.random() * 120;
    console.log(`⏳ Следующая проверка через ${(delay / 1000).toFixed(0)} сек`);
    setTimeout(checkAvitoMessages, delay);
  }
}

checkAvitoMessages();
