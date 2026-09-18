/**
 * Telegram-бот для учёта доходов и расходов.
 * Записывает операции в Google Таблицу и отвечает сводками.
 */

/** Имена листов таблицы */
var SHEET_CATEGORIES = 'Категории';
var SHEET_ACCOUNTS = 'Счета';
var SHEET_BUDGET = 'Бюджет';

/** Строка заголовков операций на месячном листе */
var MONTH_OPERATIONS_HEADER_ROW = 1;

/** Первая строка данных операций на месячном листе */
var MONTH_OPERATIONS_FIRST_DATA_ROW = 2;

/** Первая колонка блока сводки на месячном листе (I) */
var MONTH_SUMMARY_START_COL = 9;

/** Заголовки колонок операций */
var OPERATIONS_HEADERS = ['Дата', 'Тип', 'Сумма', 'Категория', 'Счёт', 'Комментарий'];

/** Номера колонок операций на месячном листе */
var OPERATION_COL_CATEGORY = 4;
var OPERATION_COL_ACCOUNT = 5;
var OPERATION_COL_COMMENT = 6;

/** Типы операций */
var TYPE_EXPENSE = 'расход';
var TYPE_INCOME = 'доход';

/** Лист «Счета»: журнал переводов */
var ACCOUNTS_TRANSFER_TITLE_ROW = 6;
var ACCOUNTS_TRANSFER_HEADER_ROW = 7;
var ACCOUNTS_TRANSFER_FIRST_ROW = 8;

/** Имя счёта сбережений и направления переводов */
var ACCOUNT_SAVINGS_NAME = 'сбережения';
var TRANSFER_TO_SAVINGS = 'на сбер';
var TRANSFER_FROM_SAVINGS = 'с сбер';

/** Конструктор на листе «Бюджет»: число циклов и разметка */
var BUDGET_CYCLE_COUNT = 6;
var BUDGET_MATRIX_START_COL = 6;
var BUDGET_AVG_START_ROW = 10;
var BUDGET_SETTINGS_CLEAR_ROWS = 7;

/**
 * Обрабатывает одно обновление от Telegram.
 * @param {Object} update Объект update из getUpdates.
 */
function processTelegramUpdate(update) {
  var message = update.message;

  if (message && message.message_id && message.chat) {
    if (isDuplicateMessage(message.chat.id, message.message_id)) {
      Logger.log('Пропуск дубля message_id: ' + message.message_id);
      return;
    }
  }

  if (update.update_id && isDuplicateUpdate(update.update_id)) {
    return;
  }

  if (!message || !message.text) {
    return;
  }

  var chatId = message.chat.id;
  var text = message.text.trim();

  if (!isChatAllowed(chatId)) {
    sendTelegramMessage(chatId, 'Доступ запрещён. Укажите свой chat_id в настройках скрипта.');
    return;
  }

  handleUserMessage(chatId, text);
}

/**
 * Опрашивает Telegram через getUpdates (режим polling).
 */
function pollTelegramUpdates() {
  var lock = LockService.getScriptLock();

  if (!lock.tryLock(30000)) {
    Logger.log('pollTelegramUpdates: уже выполняется, пропуск');
    return;
  }

  try {
    pollTelegramUpdatesInternal();
  } finally {
    lock.releaseLock();
  }
}

/**
 * Внутренняя логика опроса Telegram.
 */
function pollTelegramUpdatesInternal() {
  var token = getScriptProperty('BOT_TOKEN');

  if (!token) {
    Logger.log('BOT_TOKEN не задан');
    return;
  }

  var offset = Number(getScriptProperty('LAST_UPDATE_ID') || '0') + 1;
  var url =
    'https://api.telegram.org/bot' + token +
    '/getUpdates?offset=' + offset + '&timeout=0';

  var response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  var data = JSON.parse(response.getContentText());

  if (!data.ok || !data.result || data.result.length === 0) {
    return;
  }

  var lastUpdateId = offset - 1;
  var seenInBatch = {};

  data.result.forEach(function(update) {
    lastUpdateId = update.update_id;

    var message = update.message;
    if (message && message.message_id && message.chat) {
      var batchKey = message.chat.id + '_' + message.message_id;

      if (seenInBatch[batchKey]) {
        Logger.log('Пропуск дубля в пакете: ' + batchKey);
        return;
      }

      seenInBatch[batchKey] = true;
    }

    try {
      processTelegramUpdate(update);
    } catch (error) {
      Logger.log('pollTelegramUpdates error: ' + error);
    }
  });

  setScriptProperty('LAST_UPDATE_ID', String(lastUpdateId));
}

/**
 * Пропускает все накопившиеся сообщения и запоминает последний update_id.
 */
function resetUpdateOffset() {
  var token = getScriptProperty('BOT_TOKEN');

  if (!token) {
    return;
  }

  var url = 'https://api.telegram.org/bot' + token + '/getUpdates?offset=-1&limit=1';
  var response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  var data = JSON.parse(response.getContentText());

  if (data.ok && data.result && data.result.length > 0) {
    var lastId = data.result[data.result.length - 1].update_id;
    setScriptProperty('LAST_UPDATE_ID', String(lastId));
    Logger.log('LAST_UPDATE_ID = ' + lastId + ' (старые сообщения пропущены)');
    return;
  }

  setScriptProperty('LAST_UPDATE_ID', '0');
  Logger.log('LAST_UPDATE_ID = 0 (очередь пуста)');
}

/**
 * Удаляет триггер polling.
 */
function removePollingTrigger() {
  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    if (trigger.getHandlerFunction() === 'pollTelegramUpdates') {
      ScriptApp.deleteTrigger(trigger);
    }
  });
}

/**
 * Обрабатывает текстовое сообщение пользователя.
 * @param {number|string} chatId Идентификатор чата Telegram.
 * @param {string} text Текст сообщения.
 */
function handleUserMessage(chatId, text) {
  var lines = text.split(/\r?\n/)
    .map(function(line) { return line.trim(); })
    .filter(function(line) { return line.length > 0; });

  if (lines.length === 0) {
    return;
  }

  if (lines.length === 1 && lines[0].indexOf('/') === 0) {
    handleCommand(chatId, lines[0]);
    return;
  }

  var replies = [];

  lines.forEach(function(line) {
    replies.push(processTransactionLine(chatId, line));
  });

  sendTelegramMessage(chatId, replies.join('\n'));
}

/**
 * Обрабатывает одну строку с операцией.
 * @param {number|string} chatId Идентификатор чата Telegram.
 * @param {string} line Строка формата «450 еда» или «+5000 зарплата».
 * @returns {string} Текст результата для пользователя.
 */
function processTransactionLine(chatId, line) {
  if (line.indexOf('/') === 0) {
    return line + ' — команды отправляйте отдельным сообщением';
  }

  var transferResult = processTransferLine(line);
  if (transferResult !== null) {
    return transferResult;
  }

  var isIncome = line.charAt(0) === '+';
  var normalizedText = isIncome ? line.substring(1).trim() : line;
  var parsed = parseTransactionMessage(normalizedText);

  if (!parsed) {
    return line + ' — не понял формат';
  }

  var categoryType = isIncome ? TYPE_INCOME : TYPE_EXPENSE;

  if (!isKnownCategory(parsed.category, categoryType)) {
    return line + ' — неизвестная категория «' + parsed.category + '»';
  }

  if (!isKnownAccount(parsed.account)) {
    return line + ' — неизвестный счёт «' + parsed.account + '»';
  }

  appendTransaction({
    type: categoryType,
    amount: parsed.amount,
    category: parsed.category,
    account: parsed.account,
    comment: parsed.comment
  });

  var sign = isIncome ? '+' : '-';
  var reply = 'Записано: ' + sign + formatMoney(parsed.amount) + ' · ' + parsed.category + ' (' + parsed.account + ')';

  if (parsed.comment) {
    reply += ', ' + parsed.comment;
  }

  return reply;
}

/**
 * Обрабатывает команды бота.
 * @param {number|string} chatId Идентификатор чата Telegram.
 * @param {string} text Текст команды.
 */
function handleCommand(chatId, text) {
  var command = text.split(/\s+/)[0].toLowerCase().split('@')[0];
  var action = normalizeBotCommand(command);

  if (!action) {
    sendTelegramMessage(chatId, 'Неизвестная команда. Используйте /hel.');
    return;
  }

  switch (action) {
    case 'help':
      sendTelegramMessage(chatId, buildHelpMessage());
      break;
    case 'today':
      sendTelegramMessage(chatId, buildTodaySummary());
      break;
    case 'month':
      sendTelegramMessage(chatId, buildMonthSummary());
      break;
    case 'categories':
      sendTelegramMessage(chatId, buildCategoriesMessage());
      break;
    case 'budget':
      sendTelegramMessage(chatId, buildBudgetMessage(false));
      break;
    case 'cycle':
      sendTelegramMessage(chatId, buildCycleSummary());
      break;
    case 'savings':
      sendTelegramMessage(chatId, buildSavingsMessage());
      break;
    default:
      sendTelegramMessage(chatId, 'Неизвестная команда. Используйте /hel.');
  }
}

/**
 * Приводит команду бота к короткому действию (3 буквы или алиас).
 * @param {string} command Текст команды, например /tod.
 * @returns {string|null} Имя действия или null.
 */
function normalizeBotCommand(command) {
  var map = {
    '/hel': 'help',
    '/start': 'help',
    '/tod': 'today',
    '/mon': 'month',
    '/cat': 'categories',
    '/bud': 'budget',
    '/cur': 'cycle',
    '/sav': 'savings'
  };

  return map[command] || null;
}

/**
 * Разбирает сообщение перевода «25000 > сбер [комментарий]».
 * @param {string} text Текст сообщения.
 * @returns {{amount:number, direction:string, comment:string}|null} Результат разбора.
 */
function parseTransferMessage(text) {
  var match = text.match(/^(\d+(?:[.,]\d{1,2})?)\s*([<>])\s*(сбер|сбережения)(?:\s+(.*))?$/i);

  if (!match) {
    return null;
  }

  return {
    amount: parseFloat(match[1].replace(',', '.')),
    direction: match[2],
    comment: (match[4] || '').trim()
  };
}

/**
 * Обрабатывает строку перевода карта ↔ сбережения.
 * @param {string} line Текст сообщения.
 * @returns {string|null} Ответ пользователю или null, если это не перевод.
 */
function processTransferLine(line) {
  var parsed = parseTransferMessage(line);

  if (!parsed) {
    return null;
  }

  var isDeposit = parsed.direction === '>';
  var directionLabel = isDeposit ? TRANSFER_TO_SAVINGS : TRANSFER_FROM_SAVINGS;
  var balanceBefore = getSavingsBalance();
  var balanceAfter = isDeposit ? balanceBefore + parsed.amount : balanceBefore - parsed.amount;

  appendAccountTransfer({
    amount: parsed.amount,
    direction: directionLabel,
    comment: parsed.comment
  });

  var lines = [];

  if (isDeposit) {
    lines.push('На сбережения: ' + formatMoney(parsed.amount));
  } else {
    lines.push('Со сбережений на карту: ' + formatMoney(parsed.amount));

    if (balanceAfter < 0) {
      lines.push('Внимание: баланс станет ' + formatMoney(balanceAfter));
    }
  }

  lines.push('Баланс сбережений: ' + formatMoney(getSavingsBalance()));

  if (parsed.comment) {
    lines.push(parsed.comment);
  }

  return lines.join('\n');
}

/**
 * Разбирает сообщение формата «сумма категория [счёт] [комментарий]».
 * @param {string} text Текст без ведущего «+».
 * @returns {{amount:number, category:string, account:string, comment:string}|null} Результат разбора.
 */
function parseTransactionMessage(text) {
  var match = text.match(/^(\d+(?:[.,]\d{1,2})?)\s+(\S+)(?:\s+(.*))?$/);

  if (!match) {
    return null;
  }

  var amount = parseFloat(match[1].replace(',', '.'));
  var category = match[2].toLowerCase();
  var tail = (match[3] || '').trim();
  var account = getDefaultAccount();
  var comment = '';

  if (tail) {
    var parts = tail.split(/\s+/);
    var knownAccounts = getAccountNames();

    if (knownAccounts.indexOf(parts[0].toLowerCase()) !== -1) {
      account = parts[0].toLowerCase();
      comment = parts.slice(1).join(' ');
    } else {
      comment = tail;
    }
  }

  return {
    amount: amount,
    category: category,
    account: account,
    comment: comment
  };
}

/**
 * Возвращает имя месячного листа формата YYYY-MM.
 * @param {Date} date Дата операции.
 * @returns {string} Имя листа.
 */
function getMonthSheetName(date) {
  var d = date || new Date();
  var year = d.getFullYear();
  var month = d.getMonth() + 1;
  return year + '-' + (month < 10 ? '0' + month : String(month));
}

/**
 * Проверяет, является ли имя листа месячным (YYYY-MM).
 * @param {string} name Имя листа.
 * @returns {boolean} true, если это месячный лист.
 */
function isMonthSheetName(name) {
  return /^\d{4}-\d{2}$/.test(name);
}

/**
 * Проверяет, является ли лист системным справочником.
 * @param {string} name Имя листа.
 * @returns {boolean} true, если лист системный.
 */
function isSystemSheetName(name) {
  return name === SHEET_CATEGORIES || name === SHEET_ACCOUNTS || name === SHEET_BUDGET;
}

/**
 * Возвращает границы календарного месяца для даты.
 * @param {Date} date Дата внутри месяца.
 * @returns {{start:Date, end:Date}} Начало и конец месяца.
 */
function getCalendarMonthRange(date) {
  var d = date || new Date();
  var start = new Date(d.getFullYear(), d.getMonth(), 1);
  start.setHours(0, 0, 0, 0);
  var end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  end.setHours(23, 59, 59, 999);
  return { start: start, end: end };
}

/**
 * Возвращает имена месячных листов, пересекающихся с периодом.
 * @param {Date} startDate Начало периода.
 * @param {Date} endDate Конец периода.
 * @returns {string[]} Список имён листов.
 */
function getMonthSheetNamesInRange(startDate, endDate) {
  var names = [];
  var current = new Date(startDate.getFullYear(), startDate.getMonth(), 1);

  while (current <= endDate) {
    names.push(getMonthSheetName(current));
    current = new Date(current.getFullYear(), current.getMonth() + 1, 1);
  }

  return names;
}

/**
 * Возвращает все месячные листы книги.
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} spreadsheet Таблица.
 * @returns {string[]} Имена месячных листов.
 */
function getAllMonthSheetNames(spreadsheet) {
  return spreadsheet.getSheets()
    .map(function(sheet) { return sheet.getName(); })
    .filter(isMonthSheetName);
}

/**
 * Возвращает или создаёт месячный лист для указанной даты.
 * @param {Date} date Дата операции.
 * @returns {GoogleAppsScript.Spreadsheet.Sheet} Лист месяца.
 */
function getOrCreateMonthSheet(date) {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var sheetName = getMonthSheetName(date);
  var sheet = spreadsheet.getSheetByName(sheetName);

  if (!sheet) {
    sheet = spreadsheet.insertSheet(sheetName);
    setupMonthSheetLayout(sheet, date);
    setupOperationsValidationsForSheet(sheet);

    if (sheetName === getMonthSheetName(new Date())) {
      spreadsheet.setActiveSheet(sheet);
      spreadsheet.moveActiveSheet(0);
    } else {
      moveSheetBeforeSystemSheets(spreadsheet, sheet);
    }
  }

  return sheet;
}

/**
 * Перемещает лист перед системными справочниками.
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} spreadsheet Таблица.
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet Лист для перемещения.
 */
function moveSheetBeforeSystemSheets(spreadsheet, sheet) {
  var sheets = spreadsheet.getSheets();
  var targetIndex = sheets.length - 1;

  for (var i = 0; i < sheets.length; i++) {
    if (isSystemSheetName(sheets[i].getName())) {
      targetIndex = i;
      break;
    }
  }

  spreadsheet.setActiveSheet(sheet);
  spreadsheet.moveActiveSheet(targetIndex);
}

/**
 * Возвращает дату без времени.
 * @param {Date} date Исходная дата.
 * @returns {Date} Дата с обнулённым временем.
 */
function getDateOnly(date) {
  var d = new Date(date || new Date());
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Настраивает сводку справа на месячном листе (колонка I и далее).
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet Месячный лист.
 * @param {Date} date Дата внутри месяца листа.
 */
function setupMonthSheetSummary(sheet, date) {
  var dataRow = MONTH_OPERATIONS_FIRST_DATA_ROW;
  var col = MONTH_SUMMARY_START_COL;
  var valueCol = col + 1;
  var d = date || new Date();
  var year = d.getFullYear();
  var month = d.getMonth() + 1;
  var nextYear = month === 12 ? year + 1 : year;
  var nextMonth = month === 12 ? 1 : month + 1;
  var accounts = "'" + SHEET_ACCOUNTS + "'";
  var firstTransferRow = ACCOUNTS_TRANSFER_FIRST_ROW;
  var dateFrom = 'DATE(' + year + ';' + month + ';1)';
  var dateTo = 'DATE(' + nextYear + ';' + nextMonth + ';1)';

  // Очищаем блок сводки, чтобы старый QUERY не конфликтовал с новыми подписями.
  sheet.getRange(1, col, 100, valueCol).clearContent();

  sheet.getRange(1, col).setValue('Сводка месяца');
  sheet.getRange(2, col).setValue('Расходы');
  sheet.getRange(3, col).setValue('Доходы');
  sheet.getRange(4, col).setValue('На сбер');
  sheet.getRange(5, col).setValue('Со сбера');
  sheet.getRange(6, col).setValue('Остаток');
  sheet.getRange(8, col).setValue('По категориям (расходы)');

  sheet.getRange(2, valueCol).setFormula('=SUMIFS(C' + dataRow + ':C; B' + dataRow + ':B; "расход")');
  sheet.getRange(3, valueCol).setFormula('=SUMIFS(C' + dataRow + ':C; B' + dataRow + ':B; "доход")');
  sheet.getRange(4, valueCol).setFormula(
    '=SUMIFS(' + accounts + '!C' + firstTransferRow + ':C;' +
    accounts + '!B' + firstTransferRow + ':B;"' + TRANSFER_TO_SAVINGS + '";' +
    accounts + '!A' + firstTransferRow + ':A;">="&' + dateFrom + ';' +
    accounts + '!A' + firstTransferRow + ':A;"<"&' + dateTo + ')'
  );
  sheet.getRange(5, valueCol).setFormula(
    '=SUMIFS(' + accounts + '!C' + firstTransferRow + ':C;' +
    accounts + '!B' + firstTransferRow + ':B;"' + TRANSFER_FROM_SAVINGS + '";' +
    accounts + '!A' + firstTransferRow + ':A;">="&' + dateFrom + ';' +
    accounts + '!A' + firstTransferRow + ':A;"<"&' + dateTo + ')'
  );
  sheet.getRange(6, valueCol).setFormula('=J3-J2-J4+J5');
  sheet.getRange(9, col).setFormula(
    '=QUERY(A' + dataRow + ':F; "select D, sum(C) where B=\'расход\' and A is not null group by D order by sum(C) desc label D \'Категория\', sum(C) \'Сумма\'"; 0)'
  );
}

/**
 * Читает операции с месячного листа, начиная с указанной строки.
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet Месячный лист.
 * @param {number} firstDataRow Первая строка данных.
 * @returns {Array<{date:Date, type:string, amount:number, category:string, account:string, comment:string}>} Операции.
 */
function readOperationsFromSheet(sheet, firstDataRow) {
  var lastRow = sheet.getLastRow();

  if (lastRow < firstDataRow) {
    return [];
  }

  var colCount = Math.min(OPERATIONS_HEADERS.length, sheet.getLastColumn());
  var values = sheet.getRange(
    firstDataRow,
    1,
    lastRow - firstDataRow + 1,
    colCount
  ).getValues();

  var rows = [];

  for (var i = 0; i < values.length; i++) {
    var row = values[i];

    if (!row[0] || !row[1] || !row[2]) {
      continue;
    }

    rows.push({
      date: getDateOnly(new Date(row[0])),
      type: String(row[1]),
      amount: Number(row[2]),
      category: String(row[3] || ''),
      account: String(row[4] || ''),
      comment: String(row[5] || '')
    });
  }

  return rows;
}

/**
 * Возвращает номер следующей строки для записи операции (только колонка A).
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet Месячный лист.
 * @returns {number} Номер строки для новой операции.
 */
function getNextOperationRow(sheet) {
  var firstRow = MONTH_OPERATIONS_FIRST_DATA_ROW;
  var values = sheet.getRange(firstRow, 1, sheet.getMaxRows() - firstRow + 1, 1).getValues();

  for (var i = values.length - 1; i >= 0; i--) {
    if (values[i][0] !== '' && values[i][0] != null) {
      return firstRow + i + 1;
    }
  }

  return firstRow;
}

/**
 * Добавляет одну операцию в таблицу на месячном листе.
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet Месячный лист.
 * @param {{date?:Date, type:string, amount:number, category:string, account:string, comment:string}} data Данные операции.
 */
function appendOperationToSheet(sheet, data) {
  var nextRow = getNextOperationRow(sheet);

  sheet.getRange(nextRow, 1, 1, OPERATIONS_HEADERS.length).setValues([[
    getDateOnly(data.date || new Date()),
    data.type,
    data.amount,
    data.category,
    data.account,
    data.comment || ''
  ]]);

  sheet.getRange(nextRow, 1).setNumberFormat('dd.MM.yyyy');
}

/**
 * Настраивает таблицу операций слева и сводку справа на месячном листе.
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet Месячный лист.
 * @param {Date} date Дата внутри месяца листа.
 */
function setupMonthSheetLayout(sheet, date) {
  sheet.getRange(MONTH_OPERATIONS_HEADER_ROW, 1, 1, OPERATIONS_HEADERS.length).setValues([OPERATIONS_HEADERS]);
  sheet.setFrozenRows(MONTH_OPERATIONS_HEADER_ROW);
  sheet.getRange(
    MONTH_OPERATIONS_FIRST_DATA_ROW,
    1,
    sheet.getMaxRows() - MONTH_OPERATIONS_FIRST_DATA_ROW + 1,
    1
  ).setNumberFormat('dd.MM.yyyy');
  setupMonthSheetSummary(sheet, date || new Date());
}

/**
 * Обновляет формулы сводки на месячном листе для указанной даты.
 * Запустите вручную после обновления кода для уже созданного листа.
 * @param {Date} date Дата внутри месяца (по умолчанию — сегодня).
 */
function refreshMonthSheetSummary(date) {
  var d = date || new Date();
  var sheet = getOrCreateMonthSheet(d);
  setupMonthSheetSummary(sheet, d);
  Logger.log('Сводка обновлена на листе «' + sheet.getName() + '».');
}

/**
 * Читает операции с месячного листа.
 * @param {string} sheetName Имя листа YYYY-MM.
 * @returns {Array<{date:Date, type:string, amount:number, category:string, account:string, comment:string}>} Операции.
 */
function readOperationsFromMonthSheet(sheetName) {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = spreadsheet.getSheetByName(sheetName);

  if (!sheet) {
    return [];
  }

  return readOperationsFromSheet(sheet, MONTH_OPERATIONS_FIRST_DATA_ROW);
}

/**
 * Добавляет операцию на лист текущего календарного месяца.
 * @param {{type:string, amount:number, category:string, account:string, comment:string}} data Данные операции.
 */
function appendTransaction(data) {
  var sheet = getOrCreateMonthSheet(new Date());
  appendOperationToSheet(sheet, data);
}

/**
 * Формирует сводку за сегодня.
 * @returns {string} Текст сводки.
 */
function buildTodaySummary() {
  var today = new Date();
  today.setHours(0, 0, 0, 0);
  var todayEnd = new Date(today);
  todayEnd.setHours(23, 59, 59, 999);
  var rows = getTransactionRows(today, todayEnd);

  var expenseTotal = 0;
  var incomeTotal = 0;
  var expenseByCategory = {};
  var count = 0;

  rows.forEach(function(row) {
    var date = row.date;
    date.setHours(0, 0, 0, 0);

    if (date.getTime() !== today.getTime()) {
      return;
    }

    count++;

    if (row.type === TYPE_INCOME) {
      incomeTotal += row.amount;
    } else {
      expenseTotal += row.amount;
      expenseByCategory[row.category] = (expenseByCategory[row.category] || 0) + row.amount;
    }
  });

  if (count === 0) {
    return 'Сегодня операций пока нет.';
  }

  var lines = ['Сводка за сегодня', ''];

  Object.keys(expenseByCategory).sort().forEach(function(category) {
    lines.push('• ' + category + ': ' + formatMoney(expenseByCategory[category]));
  });

  lines.push('');
  lines.push('Расходы: ' + formatMoney(expenseTotal));
  lines.push('Доходы: ' + formatMoney(incomeTotal));
  lines.push('Баланс дня: ' + formatMoney(incomeTotal - expenseTotal));

  return lines.join('\n');
}

/**
 * Формирует сводку за текущий месяц.
 * @returns {string} Текст сводки.
 */
function buildMonthSummary() {
  var now = new Date();
  var monthRange = getCalendarMonthRange(now);
  var rows = getTransactionRows(monthRange.start, monthRange.end);
  var month = now.getMonth();
  var year = now.getFullYear();

  var expenseTotal = 0;
  var incomeTotal = 0;
  var expenseByCategory = {};

  rows.forEach(function(row) {
    if (row.date.getMonth() !== month || row.date.getFullYear() !== year) {
      return;
    }

    if (row.type === TYPE_INCOME) {
      incomeTotal += row.amount;
    } else {
      expenseTotal += row.amount;
      expenseByCategory[row.category] = (expenseByCategory[row.category] || 0) + row.amount;
    }
  });

  var monthName = Utilities.formatDate(now, Session.getScriptTimeZone(), 'LLLL yyyy');
  var lines = ['Сводка за ' + monthName, ''];

  if (Object.keys(expenseByCategory).length === 0) {
    lines.push('Расходов пока нет.');
  } else {
    Object.keys(expenseByCategory).sort().forEach(function(category) {
      lines.push('• ' + category + ': ' + formatMoney(expenseByCategory[category]));
    });
  }

  lines.push('');
  lines.push('Расходы: ' + formatMoney(expenseTotal));
  lines.push('Доходы: ' + formatMoney(incomeTotal));

  var transfers = getAccountTransfersInRange(monthRange.start, monthRange.end);
  lines.push('На сбер: ' + formatMoney(transfers.toSavings));
  lines.push('Со сбера: ' + formatMoney(transfers.fromSavings));
  lines.push('Остаток: ' + formatMoney(
    incomeTotal - expenseTotal - transfers.toSavings + transfers.fromSavings
  ));

  return lines.join('\n');
}

/**
 * Возвращает строки операций из месячных листов за указанный период.
 * @param {Date} startDate Начало периода (необязательно).
 * @param {Date} endDate Конец периода (необязательно).
 * @returns {Array<{date:Date, type:string, amount:number, category:string, account:string, comment:string}>} Список операций.
 */
function getTransactionRows(startDate, endDate) {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var sheetNames;
  var rows = [];

  if (startDate && endDate) {
    sheetNames = getMonthSheetNamesInRange(startDate, endDate);
  } else {
    sheetNames = getAllMonthSheetNames(spreadsheet);
  }

  sheetNames.forEach(function(sheetName) {
    rows = rows.concat(readOperationsFromMonthSheet(sheetName));
  });

  if (startDate && endDate) {
    rows = rows.filter(function(row) {
      return row.date >= startDate && row.date <= endDate;
    });
  }

  return rows;
}

/**
 * Проверяет, разрешён ли доступ для чата.
 * @param {number|string} chatId Идентификатор чата Telegram.
 * @returns {boolean} true, если чат разрешён.
 */
function isChatAllowed(chatId) {
  var allowed = getScriptProperty('ALLOWED_CHAT_ID');

  if (!allowed) {
    return true;
  }

  return String(chatId) === String(allowed);
}

/**
 * Проверяет наличие категории нужного типа.
 * @param {string} categoryName Название категории.
 * @param {string} categoryType Тип категории.
 * @returns {boolean} true, если категория найдена.
 */
function isKnownCategory(categoryName, categoryType) {
  var sheet = getSheet(SHEET_CATEGORIES);
  var values = sheet.getDataRange().getValues();

  for (var i = 1; i < values.length; i++) {
    if (String(values[i][0]).toLowerCase() === categoryName && values[i][1] === categoryType) {
      return true;
    }
  }

  return false;
}

/**
 * Проверяет наличие счёта.
 * @param {string} accountName Название счёта.
 * @returns {boolean} true, если счёт найден.
 */
function isKnownAccount(accountName) {
  return getAccountNames().indexOf(String(accountName).toLowerCase()) !== -1;
}

/**
 * Возвращает список названий счетов.
 * @returns {string[]} Список счетов в нижнем регистре.
 */
function getAccountNames() {
  var sheet = getSheet(SHEET_ACCOUNTS);
  var values = sheet.getDataRange().getValues();
  var names = [];

  for (var i = 1; i < values.length; i++) {
    if (values[i][0]) {
      names.push(String(values[i][0]).toLowerCase());
    }
  }

  return names;
}

/**
 * Возвращает счёт по умолчанию.
 * @returns {string} Название счёта по умолчанию.
 */
function getDefaultAccount() {
  var sheet = getSheet(SHEET_ACCOUNTS);
  var values = sheet.getDataRange().getValues();

  for (var i = 1; i < values.length; i++) {
    if (values[i][2] === true || String(values[i][2]).toUpperCase() === 'TRUE' || values[i][2] === 1) {
      return String(values[i][0]).toLowerCase();
    }
  }

  if (values.length > 1 && values[1][0]) {
    return String(values[1][0]).toLowerCase();
  }

  return 'карта';
}

/**
 * Отправляет сообщение в Telegram.
 * @param {number|string} chatId Идентификатор чата.
 * @param {string} text Текст сообщения.
 */
function sendTelegramMessage(chatId, text) {
  var token = getScriptProperty('BOT_TOKEN');

  if (!token) {
    throw new Error('Не задан BOT_TOKEN в свойствах скрипта.');
  }

  var url = 'https://api.telegram.org/bot' + token + '/sendMessage';
  var payload = {
    chat_id: chatId,
    text: text
  };

  var response = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  var body = response.getContentText();
  var status = response.getResponseCode();

  if (status !== 200) {
    Logger.log('sendTelegramMessage HTTP ' + status + ': ' + body);
    return;
  }

  var parsed = JSON.parse(body);

  if (!parsed.ok) {
    Logger.log('sendTelegramMessage Telegram error: ' + body);
  }
}

/**
 * Возвращает текст справки.
 * @returns {string} Справка по командам и формату ввода.
 */
function buildHelpMessage() {
  return [
    'Быстрый учёт доходов и расходов',
    '',
    'Одна операция:',
    '850 еда',
    '450 кафе',
    '',
    'Перевод на сбережения:',
    '25000 > сбер',
    '5000 < сбер',
    '',
    'Несколько строк сразу:',
    '500 еда карта',
    '1200 кафе анталия',
    '',
    'Доход:',
    '+100000 зп',
    '+15000 фрил',
    '',
    'Команды:',
    '/bud — бюджет на жизнь',
    '/cur — траты за текущий цикл',
    '/tod — сводка за сегодня',
    '/mon — сводка за месяц',
    '/sav — баланс сбережений',
    '/cat — категории',
    '/hel — эта справка'
  ].join('\n');
}

/**
 * Формирует сообщение о балансе сбережений и последних переводах.
 * @returns {string} Текст для команды /sav.
 */
function buildSavingsMessage() {
  var balance = getSavingsBalance();
  var transfers = getRecentAccountTransfers(5);
  var lines = ['Баланс сбережений: ' + formatMoney(balance), ''];

  if (transfers.length === 0) {
    lines.push('Переводов пока нет.');
    lines.push('Пополнить: 25000 > сбер');
    lines.push('Снять: 5000 < сбер');
  } else {
    lines.push('Последние переводы:');

    transfers.forEach(function(item) {
      var sign = item.direction === TRANSFER_TO_SAVINGS ? '+' : '−';
      var row = sign + formatMoney(item.amount) + ' · ' + item.direction;

      if (item.comment) {
        row += ' · ' + item.comment;
      }

      lines.push(row);
    });
  }

  return lines.join('\n');
}

/**
 * Возвращает список категорий для команды /categories.
 * @returns {string} Текст со списком категорий расходов и доходов.
 */
function buildCategoriesMessage() {
  var sheet = getSheet(SHEET_CATEGORIES);
  var values = sheet.getDataRange().getValues();
  var expense = [];
  var income = [];

  for (var i = 1; i < values.length; i++) {
    if (!values[i][0]) {
      continue;
    }

    if (values[i][1] === TYPE_EXPENSE) {
      expense.push('• ' + values[i][0]);
    } else if (values[i][1] === TYPE_INCOME) {
      income.push('• ' + values[i][0]);
    }
  }

  return [
    'Категории расходов:',
    expense.join('\n'),
    '',
    'Категории доходов:',
    income.join('\n'),
    '',
    'Пример: 450 еда',
    'Добавить свою — лист «Категории» в таблице.'
  ].join('\n');
}

/**
 * Форматирует сумму для отображения.
 * @param {number} amount Сумма.
 * @returns {string} Отформатированная строка.
 */
function formatMoney(amount) {
  return Utilities.formatString('%.2f ₽', amount).replace('.', ',');
}

/**
 * Возвращает лист по имени.
 * @param {string} sheetName Имя листа.
 * @returns {GoogleAppsScript.Spreadsheet.Sheet} Лист таблицы.
 */
function getSheet(sheetName) {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = spreadsheet.getSheetByName(sheetName);

  if (!sheet) {
    throw new Error('Лист «' + sheetName + '» не найден. Запустите initializeSpreadsheet().');
  }

  return sheet;
}

/**
 * Возвращает значение свойства скрипта.
 * @param {string} key Ключ свойства.
 * @returns {string} Значение свойства.
 */
function getScriptProperty(key) {
  return PropertiesService.getScriptProperties().getProperty(key);
}

/**
 * Сохраняет значение свойства скрипта.
 * @param {string} key Ключ свойства.
 * @param {string} value Значение свойства.
 */
function setScriptProperty(key, value) {
  PropertiesService.getScriptProperties().setProperty(key, value);
}

/**
 * Одноразовая инициализация структуры таблицы.
 * Запустите вручную из редактора Apps Script.
 */
function initializeSpreadsheet() {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();

  ensureSheet(spreadsheet, SHEET_CATEGORIES, ['Категория', 'Тип']);
  ensureSheet(spreadsheet, SHEET_ACCOUNTS, ['Счёт', 'Описание', 'По умолчанию', 'Баланс']);
  ensureSheet(spreadsheet, SHEET_BUDGET, ['Параметр', 'Значение']);

  fillDefaultCategories();
  fillDefaultAccounts();
  setupAccountsSheetLayout();
  fillDefaultBudgetSheet();
  refreshBudgetDashboard();
  getOrCreateMonthSheet(new Date());
  setupOperationsValidations();

  SpreadsheetApp.setActiveSheet(spreadsheet.getSheetByName(getMonthSheetName(new Date())));
}

/**
 * Создаёт лист, если его ещё нет, и записывает заголовки.
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} spreadsheet Таблица.
 * @param {string} sheetName Имя листа.
 * @param {string[]} headers Заголовки колонок.
 */
function ensureSheet(spreadsheet, sheetName, headers) {
  var sheet = spreadsheet.getSheetByName(sheetName);

  if (!sheet) {
    sheet = spreadsheet.insertSheet(sheetName);
  }

  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
  }
}

/**
 * Возвращает список категорий по умолчанию.
 * @returns {Array<Array<string>>} Пары [название, тип].
 */
function getDefaultCategories() {
  return [
    ['еда', TYPE_EXPENSE],
    ['кафе', TYPE_EXPENSE],
    ['транс', TYPE_EXPENSE],
    ['дом', TYPE_EXPENSE],
    ['быт', TYPE_EXPENSE],
    ['мед', TYPE_EXPENSE],
    ['крас', TYPE_EXPENSE],
    ['подпис', TYPE_EXPENSE],
    ['отдых', TYPE_EXPENSE],
    ['путеш', TYPE_EXPENSE],
    ['одежда', TYPE_EXPENSE],
    ['техн', TYPE_EXPENSE],
    ['подар', TYPE_EXPENSE],
    ['инвест', TYPE_EXPENSE],
    ['благ', TYPE_EXPENSE],
    ['фин', TYPE_EXPENSE],
    ['привыч', TYPE_EXPENSE],
    ['прочее', TYPE_EXPENSE],
    ['зп', TYPE_INCOME],
    ['фрил', TYPE_INCOME],
    ['возврат', TYPE_INCOME],
    ['подар', TYPE_INCOME],
    ['инвест', TYPE_INCOME]
  ];
}

/**
 * Заполняет стартовые категории доходов и расходов.
 */
function fillDefaultCategories() {
  var sheet = getSheet(SHEET_CATEGORIES);

  if (sheet.getLastRow() > 1) {
    return;
  }

  writeCategoriesToSheet(getDefaultCategories());
}

/**
 * Записывает категории на лист «Категории».
 * @param {Array<Array<string>>} categories Список пар [название, тип].
 */
function writeCategoriesToSheet(categories) {
  var sheet = getSheet(SHEET_CATEGORIES);
  var lastRow = sheet.getLastRow();

  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, 2).clearContent();
  }

  sheet.getRange(2, 1, categories.length, 2).setValues(categories);
  setupOperationsValidations();
}

/**
 * Возвращает количество строк для правил проверки данных на месячном листе.
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet Месячный лист.
 * @returns {number} Число строк начиная с первой строки данных.
 */
function getOperationsValidationRowCount(sheet) {
  return sheet.getMaxRows() - MONTH_OPERATIONS_FIRST_DATA_ROW + 1;
}

/**
 * Настраивает выпадающие списки категорий и счетов на всех месячных листах.
 */
function setupOperationsValidations() {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();

  getAllMonthSheetNames(spreadsheet).forEach(function(sheetName) {
    var sheet = spreadsheet.getSheetByName(sheetName);
    setupOperationsValidationsForSheet(sheet);
  });

  Logger.log('Выпадающие списки категорий и счетов настроены на месячных листах.');
}

/**
 * Настраивает выпадающие списки категорий и счетов на одном месячном листе.
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet Месячный лист.
 */
function setupOperationsValidationsForSheet(sheet) {
  var rowCount = getOperationsValidationRowCount(sheet);
  var categoriesSheet = getSheet(SHEET_CATEGORIES);
  var accountsSheet = getSheet(SHEET_ACCOUNTS);

  var categoryRule = SpreadsheetApp.newDataValidation()
    .requireValueInRange(categoriesSheet.getRange('A2:A'), true)
    .setAllowInvalid(false)
    .build();

  var accountRule = SpreadsheetApp.newDataValidation()
    .requireValueInRange(accountsSheet.getRange('A2:A'), true)
    .setAllowInvalid(false)
    .build();

  sheet.getRange(MONTH_OPERATIONS_FIRST_DATA_ROW, OPERATION_COL_CATEGORY, rowCount, 1)
    .setDataValidation(categoryRule);

  sheet.getRange(MONTH_OPERATIONS_FIRST_DATA_ROW, OPERATION_COL_ACCOUNT, rowCount, 1)
    .setDataValidation(accountRule);

  sheet.getRange(MONTH_OPERATIONS_FIRST_DATA_ROW, OPERATION_COL_COMMENT, rowCount, 1)
    .clearDataValidations();
}

/**
 * Заменяет категории на оптимизированный набор по умолчанию.
 * Запустите один раз вручную из редактора Apps Script.
 */
function resetCategories() {
  writeCategoriesToSheet(getDefaultCategories());
  Logger.log('Категории обновлены: ' + getDefaultCategories().length + ' шт.');
}

/**
 * Заполняет лист «Бюджет» значениями по умолчанию, если он пустой.
 */
function fillDefaultBudgetSheet() {
  var sheet = getSheet(SHEET_BUDGET);

  if (sheet.getLastRow() > 1) {
    return;
  }

  writeBudgetSheet(getDefaultBudgetSettings());
}

/**
 * Возвращает настройки бюджета по умолчанию.
 * @returns {Array<Array<string>>} Пары [параметр, значение].
 */
function getDefaultBudgetSettings() {
  return [
    ['life_budget', '50000'],
    ['period_start_day', '25'],
    ['morning_summary_hour', '9'],
    ['reminder_hour', '22'],
    ['reminder_timezone', 'Europe/Moscow'],
    ['excluded_categories', 'дом,инвест,благ'],
    ['excluded_accounts', 'сбережения']
  ];
}

/**
 * Записывает настройки на лист «Бюджет» (только блок параметров A:B).
 * @param {Array<Array<string>>} settings Пары [параметр, значение].
 */
function writeBudgetSheet(settings) {
  var sheet = getSheet(SHEET_BUDGET);
  sheet.getRange(2, 1, BUDGET_SETTINGS_CLEAR_ROWS, 2).clearContent();
  sheet.getRange(2, 1, settings.length, 2).setValues(settings);
}

/**
 * Заменяет настройки бюджета на значения по умолчанию и пересобирает конструктор.
 */
function resetBudgetSheet() {
  writeBudgetSheet(getDefaultBudgetSettings());
  refreshBudgetDashboard();
  Logger.log('Лист «Бюджет» обновлён.');
}

/**
 * Читает настройки бюджета с листа «Бюджет».
 * @returns {Object} Объект настроек бюджета.
 */
function getBudgetSettings() {
  var sheet = getSheet(SHEET_BUDGET);
  var values = sheet.getDataRange().getValues();
  var map = {};

  for (var i = 1; i < values.length; i++) {
    if (!values[i][0]) {
      break;
    }

    map[String(values[i][0])] = String(values[i][1] || '');
  }

  return {
    lifeBudget: Number(map.life_budget || '50000'),
    periodStartDay: Number(map.period_start_day || '25'),
    morningSummaryHour: Number(map.morning_summary_hour || '9'),
    reminderHour: Number(map.reminder_hour || '22'),
    timezone: map.reminder_timezone || 'Europe/Moscow',
    excludedCategories: parseCsvList(map.excluded_categories || 'дом,инвест,благ'),
    excludedAccounts: parseCsvList(map.excluded_accounts || 'сбережения')
  };
}

/**
 * Разбирает строку со значениями через запятую.
 * @param {string} value Исходная строка.
 * @returns {string[]} Список значений в нижнем регистре.
 */
function parseCsvList(value) {
  return String(value)
    .split(',')
    .map(function(item) { return item.trim().toLowerCase(); })
    .filter(function(item) { return item.length > 0; });
}

/**
 * Возвращает границы текущего бюджетного периода.
 * @param {Date} now Текущая дата.
 * @param {number} periodStartDay День начала периода.
 * @returns {Object} Даты и счётчики дней периода.
 */
function getCurrentBudgetPeriod(now, periodStartDay) {
  return getBudgetPeriodByOffset(now, periodStartDay, 0);
}

/**
 * Возвращает границы бюджетного периода со сдвигом относительно текущего.
 * @param {Date} now Текущая дата.
 * @param {number} periodStartDay День начала периода.
 * @param {number} offset 0 — текущий, −1 — предыдущий и т.д.
 * @returns {Object} Даты и счётчики дней периода.
 */
function getBudgetPeriodByOffset(now, periodStartDay, offset) {
  var today = new Date(now || new Date());
  today.setHours(0, 0, 0, 0);

  var year = today.getFullYear();
  var month = today.getMonth();
  var day = today.getDate();
  var baseStart;

  if (day >= periodStartDay) {
    baseStart = new Date(year, month, periodStartDay);
  } else {
    baseStart = new Date(year, month - 1, periodStartDay);
  }

  var start = new Date(
    baseStart.getFullYear(),
    baseStart.getMonth() + offset,
    periodStartDay
  );
  var end = new Date(
    start.getFullYear(),
    start.getMonth() + 1,
    periodStartDay - 1
  );

  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);

  var msPerDay = 24 * 60 * 60 * 1000;
  var daysInPeriod = Math.round((end.getTime() - start.getTime()) / msPerDay) + 1;
  var dayInPeriod = Math.round((today.getTime() - start.getTime()) / msPerDay) + 1;
  var daysRemaining = daysInPeriod - dayInPeriod + 1;

  if (dayInPeriod < 1) {
    dayInPeriod = 1;
  }

  if (dayInPeriod > daysInPeriod) {
    dayInPeriod = daysInPeriod;
  }

  if (daysRemaining < 0) {
    daysRemaining = 0;
  }

  return {
    start: start,
    end: end,
    dayInPeriod: dayInPeriod,
    daysInPeriod: daysInPeriod,
    daysRemaining: daysRemaining
  };
}

/**
 * Возвращает названия расходных категорий с листа «Категории».
 * @returns {string[]} Список категорий расходов.
 */
function getExpenseCategoryNames() {
  var sheet = getSheet(SHEET_CATEGORIES);
  var values = sheet.getDataRange().getValues();
  var names = [];

  for (var i = 1; i < values.length; i++) {
    if (!values[i][0]) {
      continue;
    }

    if (String(values[i][1]).toLowerCase() === TYPE_EXPENSE) {
      names.push(String(values[i][0]).toLowerCase());
    }
  }

  return names;
}

/**
 * Формула DATE для ячеек таблицы (локаль с ;).
 * @param {Date} date Дата.
 * @returns {string} Фрагмент формулы DATE(...).
 */
function buildDateFormula(date) {
  return 'DATE(' + date.getFullYear() + ';' + (date.getMonth() + 1) + ';' + date.getDate() + ')';
}

/**
 * Собирает формулу суммы расходов категории за даты цикла по листам YYYY-MM.
 * @param {string} category Категория расхода.
 * @param {Date} start Начало цикла.
 * @param {Date} end Конец цикла.
 * @returns {string} Формула для ячейки.
 */
function buildCategorySumFormula(category, start, end) {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var sheetNames = getMonthSheetNamesInRange(start, end);
  var parts = [];
  var dataRow = MONTH_OPERATIONS_FIRST_DATA_ROW;
  var dateFrom = buildDateFormula(start);
  var dateTo = buildDateFormula(end);
  var escapedCategory = String(category).replace(/"/g, '""');

  sheetNames.forEach(function(sheetName) {
    if (!spreadsheet.getSheetByName(sheetName)) {
      return;
    }

    var ref = "'" + sheetName + "'";
    parts.push(
      'IFERROR(SUMIFS(' + ref + '!C' + dataRow + ':C;' +
      ref + '!B' + dataRow + ':B;"' + TYPE_EXPENSE + '";' +
      ref + '!D' + dataRow + ':D;"' + escapedCategory + '";' +
      ref + '!A' + dataRow + ':A;">="&' + dateFrom + ';' +
      ref + '!A' + dataRow + ':A;"<="&' + dateTo + ');0)'
    );
  });

  if (parts.length === 0) {
    return '0';
  }

  return '=' + parts.join('+');
}

/**
 * Подпись границ цикла для заголовка колонки.
 * @param {Date} start Начало.
 * @param {Date} end Конец.
 * @param {string} timezone Часовой пояс.
 * @returns {string} Текст вида «25.08–24.09».
 */
function formatCycleHeader(start, end, timezone) {
  var tz = timezone || 'Europe/Moscow';
  return Utilities.formatDate(start, tz, 'dd.MM') + '–' +
    Utilities.formatDate(end, tz, 'dd.MM');
}

/**
 * Пересобирает конструктор на листе «Бюджет»: среднее под параметрами, матрица циклов справа.
 * Запускайте после смены period_start_day.
 */
function refreshBudgetDashboard() {
  var sheet = getSheet(SHEET_BUDGET);
  var settings = getBudgetSettings();
  var categories = getExpenseCategoryNames();
  var now = new Date();
  var cycles = [];
  var offset;
  var matrixCol = BUDGET_MATRIX_START_COL;
  var avgStartRow = BUDGET_AVG_START_ROW;
  var avgFirstDataRow = avgStartRow + 1;
  var matrixHeaderRow = 1;
  var matrixFirstDataRow = 2;
  var cycleCount = BUDGET_CYCLE_COUNT;
  var matrixLastValueCol = matrixCol + cycleCount;
  var i;
  var c;
  var matrixRow;
  var avgRow;
  var matrixHeader = ['Категория'];
  var matrixValues = [];
  var avgValues = [];
  var totalFormulas = ['Итого'];
  var totalRow;
  var firstValueColLetter;
  var lastValueColLetter;

  for (offset = 0; offset > -cycleCount; offset--) {
    cycles.push(getBudgetPeriodByOffset(now, settings.periodStartDay, offset));
  }

  // Очищаем среднее под параметрами и всё справа от B (зазор C–E + матрица + старый мусор).
  sheet.getRange(avgStartRow, 1, 200, 2).clearContent();
  sheet.getRange(1, 3, 200, 20).clearContent();

  sheet.getRange(avgStartRow, 1).setValue('Категория').setFontWeight('bold');
  sheet.getRange(avgStartRow, 2).setValue('Среднее (>0)').setFontWeight('bold');

  for (c = 0; c < cycles.length; c++) {
    matrixHeader.push(formatCycleHeader(cycles[c].start, cycles[c].end, settings.timezone));
  }

  sheet.getRange(matrixHeaderRow, matrixCol, 1, matrixHeader.length).setValues([matrixHeader]);
  sheet.getRange(matrixHeaderRow, matrixCol, 1, matrixHeader.length).setFontWeight('bold');

  if (categories.length === 0) {
    Logger.log('Конструктор бюджета: нет расходных категорий.');
    return;
  }

  firstValueColLetter = columnIndexToLetter(matrixCol + 1);
  lastValueColLetter = columnIndexToLetter(matrixLastValueCol);

  for (i = 0; i < categories.length; i++) {
    matrixRow = matrixFirstDataRow + i;
    avgRow = avgFirstDataRow + i;
    var line = [categories[i]];

    for (c = 0; c < cycles.length; c++) {
      line.push(buildCategorySumFormula(categories[i], cycles[c].start, cycles[c].end));
    }

    matrixValues.push(line);
    avgValues.push([
      categories[i],
      '=IFERROR(AVERAGEIF(' + firstValueColLetter + matrixRow + ':' + lastValueColLetter + matrixRow + ';">0");0)'
    ]);
  }

  sheet.getRange(matrixFirstDataRow, matrixCol, categories.length, 1 + cycleCount).setValues(matrixValues);
  sheet.getRange(avgFirstDataRow, 1, categories.length, 2).setValues(avgValues);

  totalRow = matrixFirstDataRow + categories.length;
  for (c = 0; c < cycleCount; c++) {
    totalFormulas.push(
      '=SUM(' + columnIndexToLetter(matrixCol + 1 + c) + matrixFirstDataRow + ':' +
      columnIndexToLetter(matrixCol + 1 + c) + (totalRow - 1) + ')'
    );
  }

  sheet.getRange(totalRow, matrixCol, 1, totalFormulas.length).setValues([totalFormulas]);
  sheet.getRange(totalRow, matrixCol).setFontWeight('bold');

  sheet.getRange(avgFirstDataRow, 2, categories.length, 1).setNumberFormat('#,##0');
  sheet.getRange(matrixFirstDataRow, matrixCol + 1, categories.length + 1, cycleCount).setNumberFormat('#,##0');

  Logger.log('Конструктор бюджета обновлён: ' + cycleCount + ' циклов, категорий — ' + categories.length);
}

/**
 * При изменении period_start_day на листе «Бюджет» пересобирает конструктор.
 * @param {GoogleAppsScript.Events.SheetsOnEdit} e Событие редактирования.
 */
function onEdit(e) {
  if (!e || !e.range) {
    return;
  }

  var sheet = e.range.getSheet();

  if (sheet.getName() !== SHEET_BUDGET) {
    return;
  }

  if (e.range.getColumn() !== 2 || e.range.getRow() < 2) {
    return;
  }

  var paramName = String(sheet.getRange(e.range.getRow(), 1).getValue());

  if (paramName !== 'period_start_day') {
    return;
  }

  refreshBudgetDashboard();
}

/**
 * Преобразует номер колонки (1-based) в букву A1.
 * @param {number} columnIndex Номер колонки.
 * @returns {string} Буква колонки.
 */
function columnIndexToLetter(columnIndex) {
  var col = columnIndex;
  var letter = '';
  var temp;

  while (col > 0) {
    temp = (col - 1) % 26;
    letter = String.fromCharCode(65 + temp) + letter;
    col = Math.floor((col - 1) / 26);
  }

  return letter;
}

/**
 * Формирует сводку трат по категориям за текущий бюджетный цикл.
 * @returns {string} Текст для команды /cur.
 */
function buildCycleSummary() {
  var settings = getBudgetSettings();
  var period = getBudgetPeriodByOffset(new Date(), settings.periodStartDay, 0);
  var rows = getTransactionRows(period.start, period.end);
  var expenseTotal = 0;
  var expenseByCategory = {};
  var tz = settings.timezone;
  var startText = Utilities.formatDate(period.start, tz, 'd MMM');
  var endText = Utilities.formatDate(period.end, tz, 'd MMM');

  rows.forEach(function(row) {
    if (row.type !== TYPE_EXPENSE) {
      return;
    }

    expenseTotal += row.amount;
    expenseByCategory[row.category] = (expenseByCategory[row.category] || 0) + row.amount;
  });

  var excluded = settings.excludedCategories;
  var lifeByCategory = {};
  var lifeTotal = 0;

  Object.keys(expenseByCategory).forEach(function(category) {
    if (excluded.indexOf(category.toLowerCase()) !== -1) {
      return;
    }

    lifeByCategory[category] = expenseByCategory[category];
    lifeTotal += expenseByCategory[category];
  });

  var lines = [
    'Цикл: ' + startText + ' — ' + endText +
      ' (день ' + period.dayInPeriod + ' из ' + period.daysInPeriod + ')',
    '',
    'Расходы: −' + formatMoney(expenseTotal)
  ];

  if (Object.keys(lifeByCategory).length === 0) {
    lines.push('  (пока нет)');
  } else {
    Object.keys(lifeByCategory).sort(function(a, b) {
      return lifeByCategory[b] - lifeByCategory[a];
    }).forEach(function(category) {
      lines.push('  • ' + category + ': −' + formatMoney(lifeByCategory[category]));
    });
  }

  lines.push('');
  lines.push('Итого на жизнь: −' + formatMoney(lifeTotal));

  return lines.join('\n');
}

/**
 * Проверяет, входит ли расход в бюджет «на жизнь».
 * @param {Object} row Строка операции.
 * @param {Object} settings Настройки бюджета.
 * @returns {boolean} true, если расход учитывается в лимите.
 */
function isLifeExpense(row, settings) {
  if (row.type !== TYPE_EXPENSE) {
    return false;
  }

  if (settings.excludedCategories.indexOf(row.category.toLowerCase()) !== -1) {
    return false;
  }

  if (settings.excludedAccounts.indexOf(row.account.toLowerCase()) !== -1) {
    return false;
  }

  return true;
}

/**
 * Суммирует траты «на жизнь» за указанный период.
 * @param {Date} periodStart Начало периода.
 * @param {Date} periodEnd Конец периода.
 * @param {Object} settings Настройки бюджета.
 * @returns {number} Сумма расходов на жизнь.
 */
function getLifeExpensesForPeriod(periodStart, periodEnd, settings) {
  var rows = getTransactionRows(periodStart, periodEnd);
  var total = 0;

  rows.forEach(function(row) {
    if (isLifeExpense(row, settings)) {
      total += row.amount;
    }
  });

  return total;
}

/**
 * Рассчитывает показатели бюджета на жизнь.
 * @returns {Object} Расчётные показатели бюджета.
 */
function calculateBudgetStatus() {
  var settings = getBudgetSettings();
  var period = getCurrentBudgetPeriod(new Date(), settings.periodStartDay);
  var spentLife = getLifeExpensesForPeriod(period.start, period.end, settings);
  var lifeBudget = settings.lifeBudget;
  var remaining = lifeBudget - spentLife;
  var idealDaily = lifeBudget / period.daysInPeriod;
  var expectedByNow = idealDaily * period.dayInPeriod;
  var paceDelta = expectedByNow - spentLife;
  var todayAllowance = remaining > 0 ? remaining / period.daysRemaining : 0;
  var daysAbstain = 0;

  if (remaining < 0) {
    daysAbstain = Math.ceil(Math.abs(remaining) / idealDaily);
  }

  return {
    settings: settings,
    period: period,
    lifeBudget: lifeBudget,
    spentLife: spentLife,
    remaining: remaining,
    idealDaily: idealDaily,
    expectedByNow: expectedByNow,
    paceDelta: paceDelta,
    todayAllowance: todayAllowance,
    daysAbstain: daysAbstain
  };
}

/**
 * Формирует текст сводки бюджета для Telegram.
 * @param {boolean} shortVersion true — краткая версия для вечернего напоминания.
 * @returns {string} Текст сообщения.
 */
function buildBudgetMessage(shortVersion) {
  var status = calculateBudgetStatus();
  var tz = status.settings.timezone;
  var startText = Utilities.formatDate(status.period.start, tz, 'd MMM');
  var endText = Utilities.formatDate(status.period.end, tz, 'd MMM');
  var lines = [];

  if (!shortVersion) {
    lines.push('Период: ' + startText + ' — ' + endText +
      ' (день ' + status.period.dayInPeriod + ' из ' + status.period.daysInPeriod + ')');
    lines.push('Бюджет на жизнь: ' + formatMoney(status.lifeBudget));
    lines.push('Потрачено: ' + formatMoney(status.spentLife));
    lines.push('Осталось: ' + formatMoney(status.remaining));
    lines.push('');
  } else {
    lines.push('Осталось на период: ' + formatMoney(status.remaining));
  }

  if (status.remaining >= 0) {
    lines.push('На сегодня: ' + formatMoney(status.todayAllowance));

    if (status.paceDelta > 0) {
      lines.push('Темп: +' + formatMoney(status.paceDelta) + ' (можно потратить больше обычного)');
    } else if (status.paceDelta < 0) {
      lines.push('Темп: ' + formatMoney(status.paceDelta) + ' (выше обычного темпа)');
    } else {
      lines.push('Темп: по плану');
    }
  } else {
    lines.push('Превышение: ' + formatMoney(Math.abs(status.remaining)));
    lines.push('На сегодня: ' + formatMoney(0));
    lines.push('Чтобы выровняться: ~' + status.daysAbstain + ' дн. без трат «на жизнь»');
  }

  return lines.join('\n');
}

/**
 * Возвращает chat_id для автоматических уведомлений.
 * @returns {string|null} chat_id или null.
 */
function getNotificationChatId() {
  return getScriptProperty('ALLOWED_CHAT_ID');
}

/**
 * Отправляет утреннюю сводку бюджета в 9:00 МСК.
 */
function sendMorningBudgetSummary() {
  var chatId = getNotificationChatId();

  if (!chatId) {
    Logger.log('sendMorningBudgetSummary: ALLOWED_CHAT_ID не задан');
    return;
  }

  var message = 'Доброе утро! Бюджет на сегодня:\n\n' + buildBudgetMessage(false);
  sendTelegramMessage(chatId, message);
}

/**
 * Отправляет вечернее напоминание занести траты в 22:00 МСК.
 */
function sendDailyReminder() {
  var chatId = getNotificationChatId();

  if (!chatId) {
    Logger.log('sendDailyReminder: ALLOWED_CHAT_ID не задан');
    return;
  }

  var message = 'Пора занести траты за день.\n\n' + buildBudgetMessage(true);
  sendTelegramMessage(chatId, message);
}

/**
 * Устанавливает триггеры утренней и вечерней рассылки.
 */
function installReminderTriggers() {
  removeReminderTriggers();

  var settings = getBudgetSettings();
  var timezone = settings.timezone;

  ScriptApp.newTrigger('sendMorningBudgetSummary')
    .timeBased()
    .everyDays(1)
    .atHour(settings.morningSummaryHour)
    .inTimezone(timezone)
    .create();

  ScriptApp.newTrigger('sendDailyReminder')
    .timeBased()
    .everyDays(1)
    .atHour(settings.reminderHour)
    .inTimezone(timezone)
    .create();

  // Раз в сутки обновляет заголовки циклов (смена периода 25→24 и т.п.).
  ScriptApp.newTrigger('refreshBudgetDashboard')
    .timeBased()
    .everyDays(1)
    .atHour(0)
    .inTimezone(timezone)
    .create();

  Logger.log('Триггеры напоминаний: ' + settings.morningSummaryHour + ':00 и ' +
    settings.reminderHour + ':00 (' + timezone + ')');
}

/**
 * Удаляет триггеры утренней и вечерней рассылки.
 */
function removeReminderTriggers() {
  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    var handler = trigger.getHandlerFunction();

    if (handler === 'sendMorningBudgetSummary' ||
        handler === 'sendDailyReminder' ||
        handler === 'refreshBudgetDashboard') {
      ScriptApp.deleteTrigger(trigger);
    }
  });
}

/**
 * Устанавливает все триггеры: polling, утренняя и вечерняя рассылка.
 */
function installAllTriggers() {
  removePollingTrigger();
  removeReminderTriggers();
  deleteTelegramWebhook(true);
  resetUpdateOffset();

  ScriptApp.newTrigger('pollTelegramUpdates')
    .timeBased()
    .everyMinutes(1)
    .create();

  installReminderTriggers();

  Logger.log('installAllTriggers: polling + напоминания установлены.');
}

/**
 * Настраивает лист «Счета»: справочник, баланс сбережений и журнал переводов.
 */
function setupAccountsSheetLayout() {
  var sheet = getSheet(SHEET_ACCOUNTS);
  var firstDataRow = ACCOUNTS_TRANSFER_FIRST_ROW;
  var savingsRow = findSavingsAccountRow(sheet);

  sheet.getRange(1, 1, 1, 4).setValues([['Счёт', 'Описание', 'По умолчанию', 'Баланс']]);
  sheet.getRange(ACCOUNTS_TRANSFER_TITLE_ROW, 1).setValue('Переводы карта ↔ сбережения');
  sheet.getRange(ACCOUNTS_TRANSFER_HEADER_ROW, 1, 1, 4).setValues([
    ['Дата', 'Направление', 'Сумма', 'Комментарий']
  ]);
  sheet.getRange(savingsRow, 4).setFormula(
    '=SUMIF(B' + firstDataRow + ':B;"' + TRANSFER_TO_SAVINGS + '";C' + firstDataRow + ':C)' +
    '-SUMIF(B' + firstDataRow + ':B;"' + TRANSFER_FROM_SAVINGS + '";C' + firstDataRow + ':C)'
  );
  sheet.getRange(
    ACCOUNTS_TRANSFER_FIRST_ROW,
    1,
    sheet.getMaxRows() - ACCOUNTS_TRANSFER_FIRST_ROW + 1,
    1
  ).setNumberFormat('dd.MM.yyyy');
}

/**
 * Возвращает номер строки счёта «сбережения» на листе «Счета».
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet Лист «Счета».
 * @returns {number} Номер строки.
 */
function findSavingsAccountRow(sheet) {
  var lastRow = Math.max(sheet.getLastRow(), 2);
  var rowCount = Math.min(lastRow - 1, 20);
  var values = sheet.getRange(2, 1, rowCount, 1).getValues();

  for (var i = 0; i < values.length; i++) {
    if (String(values[i][0]).toLowerCase() === ACCOUNT_SAVINGS_NAME) {
      return i + 2;
    }
  }

  return 4;
}

/**
 * Возвращает номер следующей строки журнала переводов.
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet Лист «Счета».
 * @returns {number} Номер строки для новой записи.
 */
function getNextTransferRow(sheet) {
  var firstRow = ACCOUNTS_TRANSFER_FIRST_ROW;
  var values = sheet.getRange(firstRow, 1, sheet.getMaxRows() - firstRow + 1, 1).getValues();

  for (var i = values.length - 1; i >= 0; i--) {
    if (values[i][0] !== '' && values[i][0] != null) {
      return firstRow + i + 1;
    }
  }

  return firstRow;
}

/**
 * Добавляет запись о переводе в журнал на листе «Счета».
 * @param {{amount:number, direction:string, comment:string}} data Данные перевода.
 */
function appendAccountTransfer(data) {
  var sheet = getSheet(SHEET_ACCOUNTS);
  var nextRow = getNextTransferRow(sheet);

  sheet.getRange(nextRow, 1, 1, 4).setValues([[
    getDateOnly(new Date()),
    data.direction,
    data.amount,
    data.comment || ''
  ]]);

  sheet.getRange(nextRow, 1).setNumberFormat('dd.MM.yyyy');
}

/**
 * Возвращает текущий баланс сбережений из колонки «Баланс».
 * @returns {number} Баланс сбережений.
 */
function getSavingsBalance() {
  var sheet = getSheet(SHEET_ACCOUNTS);
  var savingsRow = findSavingsAccountRow(sheet);
  var value = sheet.getRange(savingsRow, 4).getValue();

  return Number(value) || 0;
}

/**
 * Суммирует переводы на/со сбера за период.
 * @param {Date} startDate Начало периода.
 * @param {Date} endDate Конец периода.
 * @returns {{toSavings:number, fromSavings:number, net:number}} Суммы переводов.
 */
function getAccountTransfersInRange(startDate, endDate) {
  var sheet = getSheet(SHEET_ACCOUNTS);
  var lastRow = sheet.getLastRow();
  var toSavings = 0;
  var fromSavings = 0;

  if (lastRow < ACCOUNTS_TRANSFER_FIRST_ROW) {
    return { toSavings: 0, fromSavings: 0, net: 0 };
  }

  var values = sheet.getRange(
    ACCOUNTS_TRANSFER_FIRST_ROW,
    1,
    lastRow - ACCOUNTS_TRANSFER_FIRST_ROW + 1,
    3
  ).getValues();

  var start = getDateOnly(startDate);
  var end = getDateOnly(endDate);

  for (var i = 0; i < values.length; i++) {
    var row = values[i];

    if (!row[0] || !row[1] || !row[2]) {
      continue;
    }

    var date = getDateOnly(new Date(row[0]));

    if (date < start || date > end) {
      continue;
    }

    var direction = String(row[1]);
    var amount = Number(row[2]) || 0;

    if (direction === TRANSFER_TO_SAVINGS) {
      toSavings += amount;
    } else if (direction === TRANSFER_FROM_SAVINGS) {
      fromSavings += amount;
    }
  }

  return {
    toSavings: toSavings,
    fromSavings: fromSavings,
    net: toSavings - fromSavings
  };
}

/**
 * Возвращает последние переводы из журнала на листе «Счета».
 * @param {number} limit Максимальное число записей.
 * @returns {Array<{date:Date, direction:string, amount:number, comment:string}>} Переводы.
 */
function getRecentAccountTransfers(limit) {
  var sheet = getSheet(SHEET_ACCOUNTS);
  var lastRow = sheet.getLastRow();

  if (lastRow < ACCOUNTS_TRANSFER_FIRST_ROW) {
    return [];
  }

  var values = sheet.getRange(
    ACCOUNTS_TRANSFER_FIRST_ROW,
    1,
    lastRow - ACCOUNTS_TRANSFER_FIRST_ROW + 1,
    4
  ).getValues();

  var rows = [];

  for (var i = 0; i < values.length; i++) {
    var row = values[i];

    if (!row[0] || !row[1] || !row[2]) {
      continue;
    }

    rows.push({
      date: getDateOnly(new Date(row[0])),
      direction: String(row[1]),
      amount: Number(row[2]),
      comment: String(row[3] || '')
    });
  }

  if (rows.length <= limit) {
    return rows.slice().reverse();
  }

  return rows.slice(rows.length - limit).reverse();
}

/**
 * Заполняет стартовые счета.
 */
function fillDefaultAccounts() {
  var sheet = getSheet(SHEET_ACCOUNTS);

  if (sheet.getLastRow() > 1) {
    return;
  }

  var accounts = [
    ['карта', 'Основная карта', true, ''],
    ['нал', 'Наличные', false, ''],
    ['сбережения', 'Накопления', false, '']
  ];

  sheet.getRange(2, 1, accounts.length, 4).setValues(accounts);
}

/**
 * Полная первичная настройка: токен, таблица, polling и напоминания.
 * Запустите один раз из редактора Apps Script с параметрами.
 * @param {string} botToken Токен от @BotFather.
 * @param {string} allowedChatId Ваш Telegram chat_id (или пустая строка — доступ для всех).
 */
function setupExpensly(botToken, allowedChatId) {
  if (!botToken) {
    throw new Error('Укажите botToken (токен от @BotFather).');
  }

  saveBotSettings(botToken, allowedChatId || '');
  initializeSpreadsheet();
  installAllTriggers();
  Logger.log('Expensly готов. Напишите боту в Telegram: /hel');
}

/**
 * Сохраняет токен бота и chat_id в свойствах скрипта.
 * Запустите один раз и передайте значения в параметрах функции.
 * @param {string} botToken Токен Telegram-бота.
 * @param {string} allowedChatId Разрешённый chat_id (можно пустую строку).
 */
function saveBotSettings(botToken, allowedChatId) {
  setScriptProperty('BOT_TOKEN', botToken);

  if (allowedChatId) {
    setScriptProperty('ALLOWED_CHAT_ID', String(allowedChatId));
  }
}

/**
 * Проверяет, обрабатывалось ли уже это обновление (защита от дублей).
 * @param {number} updateId Идентификатор update от Telegram.
 * @returns {boolean} true, если обновление уже обработано.
 */
function isDuplicateUpdate(updateId) {
  var cache = CacheService.getScriptCache();
  var key = 'upd_' + updateId;

  if (cache.get(key)) {
    return true;
  }

  cache.put(key, '1', 21600);
  return false;
}

/**
 * Проверяет, обрабатывалось ли уже сообщение с таким message_id.
 * Telegram иногда отдаёт два update_id на одно сообщение.
 * @param {number|string} chatId Идентификатор чата.
 * @param {number} messageId Идентификатор сообщения Telegram.
 * @returns {boolean} true, если сообщение уже обработано.
 */
function isDuplicateMessage(chatId, messageId) {
  var cache = CacheService.getScriptCache();
  var key = 'msg_' + chatId + '_' + messageId;

  if (cache.get(key)) {
    return true;
  }

  cache.put(key, '1', 21600);
  return false;
}

/**
 * Удаляет webhook Telegram.
 * @param {boolean} dropPendingUpdates Очистить очередь необработанных сообщений.
 */
function deleteTelegramWebhook(dropPendingUpdates) {
  var token = getScriptProperty('BOT_TOKEN');
  var url = 'https://api.telegram.org/bot' + token + '/deleteWebhook';

  if (dropPendingUpdates) {
    url += '?drop_pending_updates=true';
  }

  Logger.log(UrlFetchApp.fetch(url).getContentText());
}
