# Expensly

Telegram-бот для учёта личных доходов и расходов в Google Sheets.  
Без сервера: всё работает на **Google Apps Script**.

Telegram bot for personal income & expense tracking in Google Sheets.  
No server: runs entirely on **Google Apps Script**.

---

## Возможности / Features

| RU | EN |
|---|---|
| Быстрый ввод: `450 еда`, `+100000 зп` | Fast input: `450 food`, `+100000 salary` |
| Переводы на сбережения: `25000 > сбер` | Savings transfers: `25000 > сбер` |
| Помесячные листы `YYYY-MM` + сводка | Monthly sheets `YYYY-MM` + summary |
| Бюджет «на жизнь» (период 25→24) | Life budget (period 25→24 by default) |
| Напоминания в 9:00 и 22:00 (МСК) | Reminders at 9:00 and 22:00 (MSK) |
| Сравнение 6 бюджетных циклов на листе | 6-cycle comparison on the Budget sheet |

### Команды / Commands

| Команда | RU | EN |
|---|---|---|
| `/hel` | Справка | Help |
| `/tod` | Сегодня | Today |
| `/mon` | Календарный месяц | Calendar month |
| `/cur` | Текущий бюджетный цикл | Current budget cycle |
| `/bud` | Лимит «на жизнь» и темп | Life budget & pace |
| `/cat` | Категории | Categories |
| `/sav` | Баланс сбережений | Savings balance |

### Примеры / Examples

```
450 еда
1200 транс
1500 крас
800 подпис
25000 > сбер
+100000 зп
+500 возврат
```

---

## Быстрый старт / Quick start

Нужны только: токен бота, Google Таблица, одна функция настройки.  
You only need: bot token, a Google Sheet, one setup function.

### 1. Telegram-бот / Create a bot

1. Open [@BotFather](https://t.me/BotFather) → `/newbot`
2. Copy the **token**

Узнать свой `chat_id`: [@userinfobot](https://t.me/userinfobot)  
Get your `chat_id` from [@userinfobot](https://t.me/userinfobot)

### 2. Google Таблица / Create a spreadsheet

1. Create a new [Google Sheet](https://sheets.google.com)
2. **Extensions → Apps Script**
3. Paste the contents of [`src/Code.gs`](src/Code.gs)
4. Save (Ctrl+S)

Скрипт должен быть открыт **из этой таблицы** (не отдельный standalone-проект).  
The script must be bound to the spreadsheet (open Apps Script from the sheet).

### 3. Настройка одной функцией / One-shot setup

1. In the Apps Script editor, select function **`setupExpensly`**
2. Run it with parameters:

```
botToken       = "123456:AAH..."     // from BotFather
allowedChatId  = "123456789"       // your chat_id (or "" for anyone)
```

3. Allow Google permissions on first run
4. Message the bot: `/hel`

Готово. Бот опрашивает Telegram каждую минуту; напоминания — в 9:00 и 22:00 МСК.  
Done. The bot polls Telegram every minute; reminders at 9:00 and 22:00 MSK.

---

## Что создаётся / What gets created

| Лист / Sheet | Назначение / Purpose |
|---|---|
| `YYYY-MM` | Операции месяца + сводка в I–J / Monthly ops + summary |
| `Категории` | Справочник категорий / Category list |
| `Счета` | Карта, нал, сбережения + журнал переводов / Accounts + transfer log |
| `Бюджет` | Параметры, среднее за 6 циклов, матрица циклов / Settings + 6-cycle dashboard |

Токен хранится в **свойствах скрипта**, не в таблице.  
The token is stored in **Script Properties**, not in the spreadsheet.

---

## Полезные функции / Useful functions

| Функция | Когда запускать / When |
|---|---|
| `setupExpensly(token, chatId)` | Первая настройка / First setup |
| `refreshBudgetDashboard()` | После смены `period_start_day` / After changing period start day |
| `resetCategories()` | Обновить список категорий / Reset category list |
| `installAllTriggers()` | Переустановить polling и напоминания / Reinstall triggers |

---

## Документация / Docs

- [Категории / Categories](docs/categories.md)
- [Бюджет / Budget](docs/budget.md)
- [Сбережения / Savings](docs/savings.md)

---

## Лицензия / License

MIT
