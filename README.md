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
| Среднее по категориям за 6 циклов | Per-category average over 6 cycles |
| `/cur` — траты за текущий цикл | `/cur` — spending for the current cycle |

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

## Сценарии использования / Usage scenarios

### RU

**1. Ежедневный учёт**  
После покупки пишете в бот одну строку: `850 еда`. Вечером в 22:00 приходит напоминание, если забыли. Утром в 9:00 — сколько можно потратить «на жизнь» сегодня (`/bud`).

**2. Зарплата и раскладка**  
В день выплаты: `+100000 зп`, затем `50000 > сбер` (на накопления) и при желании `10000 инвест`. Перевод на сбер не считается расходом месяца; категория `инвест` — учёт распределения.

**3. Контроль периода 25→24**  
Лимит «на жизнь» живёт не в календарном месяце, а в бюджетном цикле. `/cur` показывает траты по категориям за текущий цикл; `/mon` — за календарный месяц. На листе **Бюджет** справа — сравнение последних 6 циклов.

**4. Смена дня начала цикла**  
Меняете `period_start_day` на листе **Бюджет** (например, с 25 на 10) — конструктор пересобирается сам. Заголовки циклов и формулы подстраиваются под новые даты.

**5. Поездка**  
Правило: категория = что купили, комментарий = поездка:

```
1200 кафе анталия
800 еда анталия
2500 путеш анталия
```

В `/mon` или `/cur` видно структуру трат; в таблице фильтр по комментарию «анталия» — итог поездки.

**6. Разбор «куда уходят деньги»**  
На листе **Бюджет**: слева среднее за 6 циклов, справа колонки циклов. Сразу видно, в каком периоде выросли еда, кафе или подписки.

**7. Новый месяц**  
Первая запись в новом календарном месяце создаёт лист `YYYY-MM`. Формулы на **Бюджет** подхватывают траты сами; в полночь раз в сутки обновляются заголовки циклов (чтобы новый бюджетный период отобразился без ручного запуска).

### EN

**1. Daily logging**  
After a purchase, send one line: `850 еда`. At 22:00 you get a reminder if you forgot. At 9:00 — how much “life budget” is left for today (`/bud`).

**2. Payday**  
On payday: `+100000 зп`, then `50000 > сбер` (savings) and optionally `10000 инвест`. A savings transfer is not a monthly expense; `инвест` tracks allocation.

**3. Cycle 25→24**  
The life budget follows the budget cycle, not the calendar month. `/cur` = categories for the current cycle; `/mon` = calendar month. The **Budget** sheet shows the last 6 cycles side by side.

**4. Change period start day**  
Edit `period_start_day` on the **Budget** sheet (e.g. 25 → 10) — the dashboard rebuilds automatically with new cycle dates and formulas.

**5. Trip**  
Category = what you bought, comment = trip name:

```
1200 кафе antalya
800 еда antalya
2500 путеш antalya
```

Use `/mon` or `/cur` for structure; filter the sheet by comment for the trip total.

**6. “Where does the money go?”**  
On **Budget**: averages for 6 cycles on the left, cycle columns on the right — spot spikes in food, cafes, or subscriptions.

**7. New month**  
The first entry in a new calendar month creates sheet `YYYY-MM`. Budget formulas pick up new spending automatically; cycle headers refresh daily at 00:00 so a new budget period appears without a manual run.

---

## Лист «Бюджет» / Budget sheet layout

| Зона / Area | Содержание / Content |
|---|---|
| **A1:B8** | Параметры (`life_budget`, `period_start_day`, …) / Settings |
| **A10:B** | Среднее по категориям за 6 циклов / 6-cycle averages |
| **C–E** | Пустой зазор / Spacer |
| **F→** | Матрица 6 циклов (текущий → старше) + «Итого» / 6-cycle matrix + totals |

### Когда обновляется дашборд / When the dashboard updates

| Событие / Event | Поведение / Behavior |
|---|---|
| Новая трата на `YYYY-MM` | Цифры в формулах сами / Cell values recalculate |
| Правка `period_start_day` | Пересборка сразу (`onEdit`) / Rebuild immediately |
| Каждый день 00:00 (МСК) | Обновление заголовков циклов / Cycle headers refresh |
| Вручную / Manual | `refreshBudgetDashboard()` |

---

## Что создаётся / What gets created

| Лист / Sheet | Назначение / Purpose |
|---|---|
| `YYYY-MM` | Операции месяца + сводка в I–J / Monthly ops + summary |
| `Категории` | Справочник категорий / Category list |
| `Счета` | Карта, нал, сбережения + журнал переводов / Accounts + transfer log |
| `Бюджет` | Параметры, среднее, матрица 6 циклов / Settings + averages + cycles |

Токен хранится в **свойствах скрипта**, не в таблице.  
The token is stored in **Script Properties**, not in the spreadsheet.

---

## Полезные функции / Useful functions

| Функция | Когда запускать / When |
|---|---|
| `setupExpensly(token, chatId)` | Первая настройка / First setup |
| `refreshBudgetDashboard()` | Ручная пересборка дашборда / Manual dashboard rebuild |
| `resetCategories()` | Обновить список категорий / Reset category list |
| `installAllTriggers()` | Переустановить polling, напоминания и ночной refresh / Reinstall triggers |

---

## Документация / Docs

- [Категории / Categories](docs/categories.md)
- [Бюджет / Budget](docs/budget.md)
- [Сбережения / Savings](docs/savings.md)
- [Настройка по шагам / Step-by-step setup](docs/setup.md)

---

## Лицензия / License

MIT
