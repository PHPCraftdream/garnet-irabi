# Дополнительное ревью готовности и безопасности IRabi

Дата: 2026-07-15.

## Provenance

В репозитории есть отдельный зональный аудит от шести Fable 5 agents, датированный 2026-07-10: [`00-SUMMARY.md`](00-SUMMARY.md). Этот документ — дополнительное ревью текущего checkout от Codex с проверкой исходников, документации, quality gates и i18n parity.

В этой среде не выполнялся отдельный аудит моделью, которую можно достоверно назвать “ChatGPT 5.6”. Поэтому такое авторство не подтверждается.

## Подтверждённые текущие результаты

- PHPStan: pass.
- PHP CS Fixer dry-run: pass.
- TypeScript lint/typecheck: pass с предупреждениями React/Hook dependency.
- Generated asset check: pass.
- i18n parity: fail — RU 898, EN 887, 11 EN keys отсутствуют.
- App-level async DB adoption: не подтверждена; в IRabi найден только финальный `pollFinishAll()` в `run_web.php`.

## Security blockers из существующего аудита

Не считать приложение production-ready до закрытия следующих пунктов:

| Severity | Область | Риск | Требуемое действие |
|---|---|---|---|
| P0/High при misconfiguration | `/dev-login` | dev marker может дать privileged login и reset DB | Явный `env=dev` gate, запрет IDE markers в artifact, negative production test |
| High | balance adjustment | moderator может менять баланс без верхнего лимита/рангового ограничения | owner-only или строгая policy, лимит, audit и transaction |
| High | role/disable flags | moderator может воздействовать на owner/admin | запрет цели равного/более высокого ранга, запрет self-target |
| Medium | booking | UI approval gate не заменяет server-side проверку эксперта | проверять approved/disabled в transaction path |
| Medium | ledger | race/replay может привести к двойной операции | DB transaction, row lock и idempotency key |
| Medium | PII/logs | moderator access и mail body требуют явной product policy | минимизация данных, masking и role policy |

Сильные стороны, которые были отмечены аудитом и должны оставаться regression gates: SQL parameter binding, CSRF/Origin checks, upload MIME/extension controls, path traversal containment, ownership checks и отсутствие пользовательского HTML в `dangerouslySetInnerHTML`.

## Перепроверка после исправлений

1. Добавить regression tests на каждый blocker.
2. Запустить полный `composer ci`, frontend checks и production build.
3. Прогнать E2E с moderator, owner, admin и обычным user.
4. Выполнить повторный ручной review изменённых controller/middleware paths.
5. Обновить `00-SUMMARY.md` новым статусом и release SHA.
