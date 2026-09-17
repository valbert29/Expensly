# Подробная настройка (если нужен разбор по шагам)

Обычный путь: см. **[README](../README.md)** → функция `setupExpensly`.

Ниже — те же шаги по отдельности.

## По отдельности

1. `saveBotSettings(botToken, allowedChatId)` — токен и chat_id  
2. `initializeSpreadsheet()` — листы, категории, бюджет, текущий месяц  
3. `installAllTriggers()` — polling каждую минуту + напоминания 9:00 / 22:00 МСК  

## Проблемы

| Симптом | Что сделать |
|---|---|
| Бот не отвечает | `installAllTriggers()`, проверить `BOT_TOKEN` |
| Два ответа на одно сообщение | `installAllTriggers()` |
| «Доступ запрещён» | Проверить `ALLOWED_CHAT_ID` |
| Нет напоминаний | Задать `ALLOWED_CHAT_ID`, затем `installAllTriggers()` |
| Сменил день периода | Меняется само при правке ячейки; или `refreshBudgetDashboard()` |

## Безопасность

- Не публикуйте токен бота  
- Задайте свой `ALLOWED_CHAT_ID`  
