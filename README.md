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
| Среднее по категориям (только циклы > 0) | Per-category average (cycles > 0 only) |
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

## Это не общий бот / Not a shared bot

Репозиторий — **инструкция и код**, чтобы собрать учёт **у себя**. Ботом автора пользоваться нельзя: у каждого свои траты и своя таблица.

The repo is a **recipe**, not a public bot. You must create **your own** bot and **your own** Google Sheet. Sharing someone else’s token would mix data or block you.

Нужны: аккаунт Google, Telegram, ~15 минут. Код писать не нужно.

---

## Быстрый старт

### 1. Токен бота — `BOT_TOKEN`

1. В Telegram откройте [@BotFather](https://t.me/BotFather) и нажмите **Start**.
2. Отправьте `/newbot`.
3. Имя бота — любое, как в списке чатов, например `Мой бюджет`.
4. Username — латиницей, **обязан** заканчиваться на `bot`, например `mi_expensly_bot`. Если занято — BotFather попросит другое.
5. В ответ придёт сообщение с **HTTP API token**: строка вида `7123456789:AAHxxxx...`  
   Это и есть `BOT_TOKEN`. Скопируйте целиком, никому не показывайте.
6. Запомните **username** бота (`@mi_expensly_bot`) — по нему его найдёте в поиске Telegram.

Повторно токен: [@BotFather](https://t.me/BotFather) → `/mybots` → ваш бот → **API Token**.

### 2. Ваш номер чата — `ALLOWED_CHAT_ID`

Нужен, чтобы бот принимал сообщения **только от вас** и слал утренние/вечерние напоминания.

1. В Telegram откройте [@userinfobot](https://t.me/userinfobot) и нажмите **Start** (или отправьте любое сообщение).
2. Бот ответит карточкой. Нужно поле **Id** — целое число, например `123456789`.  
   Не берите username и не берите Id канала/группы.
3. Это число вставляете в `ALLOWED_CHAT_ID`.

### 3. Таблица и код

1. Откройте [Google Sheets](https://sheets.google.com) под **своим** Google-аккаунтом → **Пустой файл**. Можно назвать «Бюджет».
2. В таблице: **Расширения → Apps Script**. Откроется редактор — он должен быть связан с **этой** таблицей.
3. Слева файл `Code.gs`. Сотрите весь текст внутри.
4. Скопируйте содержимое [`src/Code.gs`](src/Code.gs) из этого репозитория (кнопка raw / «исходный текст») и вставьте в редактор.
5. В **первых строках** найдите `SETUP` и подставьте свои значения **в кавычки**:

```
var SETUP = {
  BOT_TOKEN: '7123456789:AAHxxxx',
  ALLOWED_CHAT_ID: '123456789'
};
```

Не оставляйте `YOUR_TELEGRAM_BOT_TOKEN` и `YOUR_CHAT_ID`. Лишние пробелы в кавычках не нужны.
6. Сохраните: значок дискеты или Ctrl+S (Cmd+S на Mac).

### 4. Запуск

1. Сверху в редакторе — выпадающий список функций. Выберите **`setupExpensly`** (не другую функцию).
2. Нажмите **Выполнить**.
3. Первый раз Google запросит права:
   - выберите свой аккаунт;
   - «Google не подтвердил приложение» — это нормально для личного скрипта;
   - **Дополнительные настройки** (Advanced) → **Перейти к … (небезопасно)**;
   - **Разрешить**.
4. Внизу редактора не должно быть красной ошибки. Если есть — откройте **Журнал** (Execution log) и сверьте токен и chat_id.

### 5. Проверка в Telegram

1. Поиск Telegram → username вашего бота из шага 1 → **Start**.
2. Отправьте `/hel` — должна прийти справка (иногда через несколько секунд: бот опрашивает Telegram раз в минуту).
3. Отправьте `100 еда` — ответ «Записано», в таблице появится лист месяца (`2026-11` и т.п.) и строка расхода.

Дальше: `450 кафе`, `+50000 зп`, `/bud`, `/cur`. Напоминания — около 9:00 и 22:00 по Москве.

### После обновления кода

Снова вставьте новый `Code.gs`, сохраните, **`setupExpensly` → Выполнить**. Если `SETUP` снова с заглушками — подставятся уже сохранённые токен и chat_id.

### Если не вышло

| Что видите | Что сделать |
|---|---|
| Ошибка про `SETUP.BOT_TOKEN` | Вставьте токен из BotFather, сохраните, снова Выполнить |
| Ошибка про `SETUP.ALLOWED_CHAT_ID` | Вставьте **Id** из @userinfobot (только цифры) |
| Бот молчит | Подождите до минуты; снова `setupExpensly`; токен без пробелов |
| «Доступ запрещён» | `ALLOWED_CHAT_ID` должен быть **ваш** Id, не username |
| Нет нового столбца цикла на листе «Бюджет» | Колонок всегда 6, они сдвигаются. Снова `setupExpensly` |

---

## Quick start (EN)

This is **not** a hosted bot. Create **your** bot and **your** spreadsheet (~15 min, no coding).

1. **Token.** Open [@BotFather](https://t.me/BotFather) → `/newbot` → display name → username ending in `bot`. Copy the **HTTP API token** (`123:AAH...`). Keep it private. To see it later: `/mybots` → API Token.
2. **Chat id.** Open [@userinfobot](https://t.me/userinfobot) → Start. Copy the numeric **Id** (not the username).
3. **Sheet.** [Google Sheets](https://sheets.google.com) → blank file → **Extensions → Apps Script**. Replace `Code.gs` with [`src/Code.gs`](src/Code.gs). At the top, set `SETUP.BOT_TOKEN` and `SETUP.ALLOWED_CHAT_ID`. Save.
4. **Run.** Select **`setupExpensly`** → **Run** → allow permissions (Advanced → Go to project).
5. **Test.** Find your bot by username → `/hel` → `100 еда`. Replies can take up to a minute.

After you paste a newer `Code.gs`, run `setupExpensly` again. If `SETUP` still has placeholders, saved credentials are reused.

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

**7. Новый месяц и новый цикл**  
Первая запись в новом календарном месяце создаёт лист `YYYY-MM`. Цифры на **Бюджет** подтягиваются сами. Колонок циклов всегда **6**: при наступлении 25-го (или вашего `period_start_day`) они **сдвигаются** — слева новый цикл, самый старый исчезает. Это делает ночной запуск в 00:00, если вы один раз запускали `setupExpensly`. Если колонка не сдвинулась — снова **Выполнить → `setupExpensly`** или `refreshBudgetDashboard`.

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

**7. New month and new cycle**  
The first entry in a new calendar month creates sheet `YYYY-MM`. Numbers update automatically. There are always **6** cycle columns: on the 25th (or your `period_start_day`) they **shift** — newest on the left, oldest drops off. That happens at 00:00 if you ran `setupExpensly` once. If the column did not shift, run **`setupExpensly`** or `refreshBudgetDashboard` again.

---

## Лист «Бюджет» / Budget sheet layout

| Зона / Area | Содержание / Content |
|---|---|
| **A1:B8** | Параметры (`life_budget`, `period_start_day`, …) / Settings |
| **A10:B** | Среднее по категориям (только циклы с суммой > 0) / Averages (cycles > 0 only) |
| **C–E** | Пустой зазор / Spacer |
| **F→** | Матрица 6 циклов (текущий → старше) + «Итого» / 6-cycle matrix + totals |

### Когда обновляется дашборд / When the dashboard updates

Колонок всегда 6, новая **не добавляется**, список сдвигается.  
Always 6 columns: they shift, a 7th is not added.

| Событие / Event | Поведение / Behavior |
|---|---|
| Новая трата на `YYYY-MM` | Цифры в формулах сами / Cell values recalculate |
| Правка `period_start_day` | Пересборка сразу / Rebuild immediately |
| Каждый день 00:00 (МСК) | Сдвиг заголовков циклов / Cycle headers shift |
| Колонка цикла не сдвинулась / Cycle column stuck | Выполнить `setupExpensly` или `refreshBudgetDashboard` |

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

В редакторе Apps Script выберите имя в списке сверху и нажмите **Выполнить**.  
Pick the function in the dropdown and click **Run**.

| Функция | Когда / When |
|---|---|
| `setupExpensly` | Первый запуск и после обновления кода / First setup and after updating Code.gs |
| `refreshBudgetDashboard` | Только сдвинуть колонки циклов на листе «Бюджет» / Only rebuild cycle columns |
| `resetCategories` | Сбросить список категорий / Reset category list |

Токен после первого `setupExpensly` хранится в свойствах скрипта. Если в `SETUP` снова заглушки — возьмутся сохранённые значения.  
After the first run, the token is stored in Script Properties. Placeholders in `SETUP` reuse the saved values.

---

## Документация / Docs

- [Категории / Categories](docs/categories.md)
- [Бюджет / Budget](docs/budget.md)
- [Сбережения / Savings](docs/savings.md)
- [Настройка по шагам / Step-by-step setup](docs/setup.md)

---

## Лицензия / License

MIT

