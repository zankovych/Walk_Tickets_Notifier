/**
 * Бекенд запрошення: Google Apps Script, прив'язаний до Google Таблиці.
 *
 * Що робить:
 *  - приймає відповідь із сайту (doPost);
 *  - дописує рядок у аркуш «Відповіді»;
 *  - надсилає повідомлення в Telegram.
 *
 * Налаштування — див. README.md у корені проєкту.
 * Секрети (токен бота, chat id) зберігаються в Project Settings → Script Properties,
 * а не в цьому коді.
 */

const SHEET_NAME = 'Відповіді';
const HEADERS = ['Час', 'Подія', 'Тест', 'Кому', 'Куди', 'Коли', 'Дата', 'По дорозі', 'Побажання', 'Скільки разів «Ні»'];

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const d = JSON.parse(e.postData.contents);
    const isOpen = d.type === 'open';
    const event = isOpen ? 'відкрила' : (Number(d.revision) > 1 ? 'змінила вибір' : 'відповідь');

    getSheet_().appendRow([
      new Date(),
      event,
      d.test ? 'так' : '',
      clean_(d.to),
      clean_(d.place),
      clean_(d.when),
      clean_(d.whenDate),
      clean_(d.treat),
      clean_(d.comment, 500),
      isOpen ? '' : (Number(d.noClicks) || 0),
    ]);

    try {
      notify_(isOpen ? openText_(d) : answerText_(d, event));
    } catch (err) {
      // рядок уже записано — не валимо відповідь через Telegram
      console.error('Telegram: ' + err);
    }
    return json_({ ok: true });
  } catch (err) {
    console.error(err);
    return json_({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

// Відкрий адресу /exec у браузері — має показати «Працює ✅»
function doGet() {
  return ContentService.createTextOutput('Працює ✅');
}

/**
 * Запусти ОДИН РАЗ вручну (кнопка ▶ Run) після того, як:
 *  1) додав TELEGRAM_TOKEN у Script Properties;
 *  2) написав своєму боту /start у Telegram.
 * Функція знайде твій chat id, збереже його і надішле тестове повідомлення.
 */
function setupTelegram() {
  const props = PropertiesService.getScriptProperties();
  const token = props.getProperty('TELEGRAM_TOKEN');
  if (!token) throw new Error('Немає TELEGRAM_TOKEN у Project Settings → Script Properties');

  const res = UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/getUpdates', { muteHttpExceptions: true });
  const data = JSON.parse(res.getContentText());
  if (!data.ok) throw new Error('Telegram відповів помилкою: ' + res.getContentText());

  const withChat = data.result.filter(function (u) { return u.message && u.message.chat; });
  if (!withChat.length) throw new Error('Не бачу повідомлень. Напиши боту /start у Telegram і запусти ще раз.');

  const chat = withChat[withChat.length - 1].message.chat;
  props.setProperty('CHAT_ID', String(chat.id));
  console.log('CHAT_ID збережено: ' + chat.id + ' (' + (chat.first_name || chat.title || '') + ')');
  notify_('✅ Бот підключено! Сюди приходитимуть відповіді на запрошення.');
}

// Перевірка без сайту: імітує відповідь і пише тестовий рядок
function testAnswer() {
  const fake = {
    type: 'answer', test: true, to: 'Тест', place: 'Стрийський парк', when: 'Ця субота',
    whenDate: 'сб, 11 жовт.', treat: 'Какао', comment: 'Це тест', noClicks: 3, revision: 1,
  };
  doPost({ postData: { contents: JSON.stringify(fake) } });
}

/* ---------- допоміжне ---------- */

function getSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(HEADERS);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

// Обрізає довжину і не дає тексту стати формулою в таблиці (=, +, -, @)
function clean_(v, max) {
  let s = String(v == null ? '' : v).slice(0, max || 200);
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  return s;
}

function answerText_(d, event) {
  const head = event === 'змінила вибір'
    ? '✏️ <b>' + h_(d.to) + ' змінила вибір</b>'
    : '🎫 <b>' + h_(d.to) + ' підтвердила квиток!</b>';
  const lines = [
    head,
    '',
    '📍 Куди: ' + h_(d.place),
    '🕒 Коли: ' + h_(d.when) + (d.whenDate ? ' (' + h_(d.whenDate) + ')' : ''),
    '☕ По дорозі: ' + h_(d.treat),
  ];
  if (d.comment) lines.push('💬 ' + h_(d.comment));
  const n = Number(d.noClicks) || 0;
  lines.push('', n ? '🙈 Тиснула «Ні»: ' + n + ' ' + plural_(n, 'раз', 'рази', 'разів') : '😇 Жодного разу не тиснула «Ні»');
  return (d.test ? '🧪 <i>ТЕСТ</i>\n' : '') + lines.join('\n');
}

function openText_(d) {
  return (d.test ? '🧪 <i>ТЕСТ</i>\n' : '') + '👀 ' + h_(d.to) + ' відкрила запрошення';
}

function notify_(text) {
  const props = PropertiesService.getScriptProperties();
  const token = props.getProperty('TELEGRAM_TOKEN');
  const chatId = props.getProperty('CHAT_ID');
  if (!token || !chatId) return; // Telegram ще не налаштовано — просто пишемо в таблицю

  const res = UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({ chat_id: chatId, text: text, parse_mode: 'HTML', disable_web_page_preview: true }),
    muteHttpExceptions: true,
  });
  if (res.getResponseCode() !== 200) throw new Error(res.getContentText());
}

function h_(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function plural_(n, one, few, many) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
