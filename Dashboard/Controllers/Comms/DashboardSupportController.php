<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Dashboard\Controllers\Comms {
    use Aura\SqlQuery\Common\SelectInterface;
    use PHPCraftdream\Garnet\Bundle\Modules\Comms\Support\Controllers\FwSupportAdminController;
    use PHPCraftdream\Garnet\Bundle\Support\Utils\HtmlLayout;
    use PHPCraftdream\Garnet\Bundle\Support\Utils\RenderIsland;
    use PHPCraftdream\Garnet\Kernel\Db\Entity\Account\Account;
    use PHPCraftdream\Garnet\Kernel\Db\Entity\Account\DbAccount;
    use PHPCraftdream\Garnet\Kernel\Db\Tables\DbTable;
    use PHPCraftdream\Garnet\Kernel\Interfaces\Core\IGlobalReqParams;
    use PHPCraftdream\Garnet\Kernel\Interfaces\Web\Router\IRouterUriParams;
    use PHPCraftdream\Garnet\Kernel\Io\Http\Router\Controller\ControllerTools;
    use PHPCraftdream\Garnet\Kernel\Io\Render\Twig\TwigParams;
    use PHPCraftdream\IRabi\Common\Services\Comms\EmailNotifications;
    use PHPCraftdream\IRabi\Common\Services\Content\NewsService;
    use PHPCraftdream\IRabi\Common\Support\PaginationHelper;
    use PHPCraftdream\IRabi\Common\System\DateUtils;
    use PHPCraftdream\IRabi\Common\Tables\Accounts\AccountBalance;
    use PHPCraftdream\IRabi\Common\Tables\Accounts\BalanceLedger;
    use PHPCraftdream\IRabi\Common\Tables\Booking\Bookings;
    use PHPCraftdream\IRabi\Common\Tables\Booking\TimeSlots;
    use PHPCraftdream\IRabi\Common\Tables\Support\SupportAssignmentLog;
    use PHPCraftdream\IRabi\Common\Tables\Support\SupportAttachments;
    use PHPCraftdream\IRabi\Common\Tables\Support\SupportMessages;
    use PHPCraftdream\IRabi\Common\Tables\Support\SupportTickets;
    use PHPCraftdream\IRabi\Dashboard\GridConfig;
    use PHPCraftdream\IRabi\Dashboard\IrabiDashboardMenuTrait;
    use PHPCraftdream\IRabi\Foreground\I18n\ForegroundI18n;
    use PHPCraftdream\IRabi\Foreground\Params\UserEntityConfig;
    use PHPCraftdream\IRabi\IRabi;

    class DashboardSupportController extends FwSupportAdminController {
        use IrabiDashboardMenuTrait;

        public const URL = '/admin/support/';

        protected static function getUploadDir(): string {
            return IRabi::getInstance()->uploadDir;
        }

        protected static function ticketsTable(): DbTable {
            return SupportTickets::get();
        }

        /**
         * Очередь обращений отвечает на два вопроса, на которые до этого не
         * отвечала: сколько обращение уже ждёт и знает ли клиент о том, что
         * внутри по нему происходило.
         *
         * D-201. Владелец ответил на тикет #5 внутренним комментарием
         * 14.09 в 22:31. Клиент увидел ответ 15.09 в 13:17 — через 14 ч 46 мин.
         * Всё это время статус был «Эскалирован», то есть «передано владельцу»,
         * и читался он как «ждём владельца». Отличить «ответа ещё нет» от
         * «ответ есть, но не передан» было нечем: дежурный видел одинаковую
         * строку в обоих случаях. Это дыра в процессе, а не забывчивость
         * конкретного человека.
         *
         * D-392. Возраст обращения не показывался нигде — тикет провисел
         * 6 суток 23 часа, и заметить это можно было только вычитая даты
         * вручную. В таблице комментариев колонка «Создано» есть, здесь не
         * было.
         *
         * Оба числа считаются здесь, а не на клиенте: сетка показывает
         * значения как есть, без вычислений, и unix-время в ячейке — это не
         * ответ человеку.
         *
         * @return array<int, array<string, mixed>>
         */
        protected static function fetchTickets(): array {
            $tickets = parent::fetchTickets();

            if ($tickets === []) {
                return $tickets;
            }

            $ids = array_map(static fn (array $row): int => (int)$row['id'], $tickets);
            $relayPending = static::ticketsAwaitingRelay($ids);

            $tz = Account::fromSession()?->readParam('time_zone') ?: null;
            $now = time();
            $t = ForegroundI18n::getInstance();

            foreach ($tickets as &$ticket) {
                $createdAt = (int)($ticket['created_at'] ?? 0);
                $ticket['created_label'] = $createdAt > 0
                    ? DateUtils::formatForUser($createdAt, $tz, 'd.m.Y H:i')
                    : '';
                $ticket['waiting_label'] = $createdAt > 0
                    ? static::humanAge($now - $createdAt)
                    : '';
                $ticket['relay_label'] = isset($relayPending[(int)$ticket['id']])
                    ? (string)$t->Support_InternalNewerValue()
                    : '';
            }
            unset($ticket);

            return $tickets;
        }

        /**
         * Обращения, где последняя внутренняя запись сотрудника новее
         * последнего видимого клиенту ответа — то есть внутри что-то
         * происходило, а человек об этом не знает.
         *
         * Намеренно НЕ утверждается, что там лежит готовый ответ. На боевом
         * тикете #5 это был именно он (владелец ответил, ответ пролежал
         * 14 ч 46 мин), а на тикете #19 — вопрос модератора владельцу.
         * Отличить одно от другого по тексту нельзя, и притворяться, что
         * можно, хуже, чем сказать правду: действие в обоих случаях одно —
         * открыть и замкнуть круг.
         *
         * Один запрос на всю страницу, а не по запросу на строку: очередь
         * ограничена двумя сотнями, и двести обращений к базе ради одной
         * колонки — это та же цена, что и сам разбор вручную.
         *
         * @param array<int, int> $ticketIds
         * @return array<int, true>
         */
        private static function ticketsAwaitingRelay(array $ticketIds): array {
            if ($ticketIds === []) {
                return [];
            }

            $messages = SupportMessages::get()->selectAll(function (SelectInterface $q) use ($ticketIds): void {
                $q->resetCols();
                $q->cols([
                    'ticket_id',
                    'MAX(CASE WHEN is_internal = 1 THEN created_at ELSE 0 END) AS last_internal',
                    'MAX(CASE WHEN is_internal = 0 THEN created_at ELSE 0 END) AS last_visible',
                ]);
                $q->where("msg_type = 'staff'");
                $q->where('ticket_id IN (?)', [$ticketIds]);
                $q->groupBy(['ticket_id']);
            });

            $pending = [];

            foreach ($messages as $row) {
                $lastInternal = (int)($row['last_internal'] ?? 0);
                $lastVisible = (int)($row['last_visible'] ?? 0);

                if ($lastInternal > 0 && $lastInternal > $lastVisible) {
                    $pending[(int)$row['ticket_id']] = true;
                }
            }

            if ($pending === []) {
                return [];
            }

            // Выкидываем два случая, где внутренняя запись — это заметка для
            // себя, а не незамкнутый круг с клиентом:
            //
            // - решённое и отклонённое: там внутренний текст это итог разбора;
            // - «ждёт ответа пользователя»: клиенту уже ответили публично, а
            //   заметку сотрудник добавил себе после. Проверено на боевых
            //   данных — тикеты 1, 2 и 4 попадали в выборку именно так, с
            //   разницей в полторы минуты между ответом и заметкой.
            //
            // Столбец, загорающийся не по делу на каждой пятой строке,
            // перестают замечать за день, и тогда он не спасёт в тот раз,
            // когда загорится по делу.
            $notPending = static::ticketsTable()->selectAll(function (SelectInterface $q) use ($pending): void {
                $q->resetCols();
                $q->cols(['id']);
                $q->where('id IN (?)', [array_keys($pending)]);
                $q->where("status IN ('resolved', 'rejected', 'waiting_user')");
            });

            foreach ($notPending as $row) {
                unset($pending[(int)$row['id']]);
            }

            return $pending;
        }

        /** Возраст обращения словами: «6 д 23 ч», «2 ч 15 м», «8 м». */
        private static function humanAge(int $seconds): string {
            $seconds = max(0, $seconds);
            $days = intdiv($seconds, 86400);
            $hours = intdiv($seconds % 86400, 3600);
            $minutes = intdiv($seconds % 3600, 60);
            $t = ForegroundI18n::getInstance();

            if ($days > 0) {
                return $days . ' ' . $t->Unit_DayShort() . ' ' . $hours . ' ' . $t->Unit_HourShort();
            }

            if ($hours > 0) {
                return $hours . ' ' . $t->Unit_HourShort() . ' ' . $minutes . ' ' . $t->Unit_MinuteShort();
            }

            return $minutes . ' ' . $t->Unit_MinuteShort();
        }

        protected static function messagesTable(): DbTable {
            return SupportMessages::get();
        }

        protected static function attachmentsTable(): DbTable {
            return SupportAttachments::get();
        }

        protected static function assignmentLogTable(): DbTable {
            return SupportAssignmentLog::get();
        }

        protected static function resolveUserRole(int $accountId): array {
            $userAccountData = Account::getAccounts(
                selectCallback: static function (SelectInterface $select) use ($accountId): void {
                    $select->resetCols();
                    $select->cols(['id']);
                    $select->where('id = ?', [$accountId]);
                },
                accountDataFields: [Account::IS_MODERATOR, Account::IS_OWNER, Account::IS_ADMIN],
            );
            $userData = $userAccountData[0] ?? [];
            $isOwner = intval($userData[Account::IS_OWNER] ?? 0) > 0;
            $isModerator = intval($userData[Account::IS_MODERATOR] ?? 0) > 0;
            $isAdmin = intval($userData[Account::IS_ADMIN] ?? 0) > 0;

            // Преподаватель он или нет, знает аккаунт. Отдельная строка
            // профиля отвечала на тот же вопрос своей копией флага и успела с
            // ним разойтись.
            $hasExpertProfile = UserEntityConfig::isApprovedExpertAccount($accountId);

            if ($isAdmin) {
                $role = 'admin';
            } elseif ($isOwner) {
                $role = 'owner';
            } elseif ($isModerator) {
                $role = 'moderator';
            } elseif ($hasExpertProfile) {
                $role = 'expert';
            } else {
                $role = 'user';
            }

            return ['role' => $role, 'has_expert_profile' => $hasExpertProfile];
        }

        protected static function accountAvatarUrl(int $accountId): ?string {
            $row = DbAccount::get()->selectOneByField('id', $accountId);
            if (!$row) {
                return null;
            }

            return UserEntityConfig::avatarUrl([
                'photo' => $row['photo'] ?? null,
                'photo_cropped' => $row['photo_cropped'] ?? null,
                'token16' => $row['token16'] ?? null,
            ]);
        }

        protected static function getStatusLabels(): array {
            $t = ForegroundI18n::getInstance();
            return [
                'open' => $t->Support_Status_Open(),
                'investigation' => $t->Support_Status_Investigation(),
                'in_progress' => $t->Support_Status_InProgress(),
                'waiting_user' => $t->Support_Status_WaitingUser(),
                'waiting_support' => $t->Support_Status_WaitingSupport(),
                'escalated' => $t->Support_Status_Escalated(),
                'on_hold' => $t->Support_Status_OnHold(),
                'resolved' => $t->Support_Status_Resolved(),
                'rejected' => $t->Support_Status_Rejected(),
            ];
        }

        protected static function getStatusChangedLabel(): string {
            return ForegroundI18n::getInstance()->Support_StatusChanged();
        }

        /**
         * D-205: эту строку читает не только сотрудник.
         *
         * Она пишется с is_internal = 0, то есть уходит в переписку клиенту —
         * и клиент видел «Статус изменён: Ожидание ответа → В работе». Названия
         * наших состояний очереди человеку снаружи не говорят ничего: они
         * описывают, чего ждём МЫ, а не что происходит с его обращением. Тот же
         * класс, что закрытая D-172, где наружу протекала внутренняя
         * маршрутизация; там закрыли маршрутизацию, здесь остался статус.
         *
         * Само событие клиенту нужно — «взяли в работу», «решили» стоят того,
         * чтобы о них сказать. Испорчена была формулировка, а не факт. Поэтому
         * переходы, у которых для клиента есть смысл, получают человеческую
         * фразу, а чисто служебные (эскалация, ожидание нашего же ответа,
         * пауза) молчат: null — сообщение не пишется вовсе.
         */
        protected static function buildStatusChangeBody(string $oldStatus, string $newStatus): ?string {
            $t = ForegroundI18n::getInstance();

            return match ($newStatus) {
                'in_progress' => $t->Support_ClientStatus_InProgress(),
                'investigation' => $t->Support_ClientStatus_Investigation(),
                'waiting_user' => $t->Support_ClientStatus_WaitingUser(),
                'resolved' => $t->Support_ClientStatus_Resolved(),
                'rejected' => $t->Support_ClientStatus_Rejected(),
                // open / waiting_support / escalated / on_hold — движение внутри
                // нашей очереди. Для человека это не новость, а шум.
                default => null,
            };
        }

        protected static function getAssignedToLabel(): string {
            return ForegroundI18n::getInstance()->Support_AssignedTo();
        }

        protected static function getUnassignedLabel(): string {
            return ForegroundI18n::getInstance()->Support_Unassigned_Action();
        }

        protected static function fetchModerators(): array {
            $accs = Account::getAccounts(
                selectCallback: static function (SelectInterface $select): void {
                    $select->resetCols();
                    $select->cols(['id', 'login', 'name']);
                },
                accountDataFields: [Account::IS_MODERATOR, Account::IS_OWNER, Account::IS_ADMIN],
            );

            // Filter to only those with moderator/owner/admin flags
            return array_values(array_filter($accs, static function (array $a): bool {
                return intval($a[Account::IS_MODERATOR] ?? 0) > 0
                    || intval($a[Account::IS_OWNER] ?? 0) > 0
                    || intval($a[Account::IS_ADMIN] ?? 0) > 0;
            }));
        }

        /**
         * Admin creates a support ticket on behalf of a user.
         * POST /admin/support/~createForUser
         */
        public static function post__createForUser(IGlobalReqParams $globals, IRouterUriParams $params): mixed {
            if (!static::isModerator()) {
                return ControllerTools::JSON(['error' => 'Access denied'], status: 403);
            }

            $targetAccountId = (int)$globals->readPostValue('account_id', '0');
            $subject = trim((string)$globals->readPostValue('subject', ''));
            $message = trim((string)$globals->readPostValue('message', ''));

            if (!$targetAccountId || $subject === '' || $message === '') {
                return ControllerTools::JSON(['error' => 'Invalid params'], status: 400);
            }

            // Verify target account exists
            $targetAccounts = Account::getAccounts(
                selectCallback: static function (SelectInterface $select) use ($targetAccountId): void {
                    $select->resetCols();
                    $select->cols(['id']);
                    $select->where('id = ?', [$targetAccountId]);
                },
            );
            if (empty($targetAccounts)) {
                return ControllerTools::JSON(['error' => 'User not found'], status: 404);
            }

            // Security audit Finding 4 (report 13): a moderator could
            // otherwise open a user-visible ticket on behalf of a
            // higher-rank staff account (owner/admin) and assign it to
            // themselves — apply the same rank boundary already enforced
            // for setUserFlag/adjustBalance.
            if (!UserEntityConfig::actorMayActOn($targetAccountId)) {
                return ControllerTools::JSON(['error' => 'Access denied'], status: 403);
            }

            $admin = Account::fromSession();
            $adminId = $admin->id();
            $now = time();

            // Create ticket owned by the target user
            $ticketId = static::ticketsTable()->insert([
                'account_id' => $targetAccountId,
                'subject' => $subject,
                'status' => 'waiting_user',
                'assignee_id' => $adminId,
                'unread_user' => 1,
                'unread_staff' => 0,
                'context' => null,
                'created_at' => $now,
                'updated_at' => $now,
            ]);

            // Create first message from admin (staff reply visible to user)
            static::messagesTable()->insert([
                'ticket_id' => (int)$ticketId,
                'author_id' => $adminId,
                'body' => $message,
                'is_internal' => 0,
                'msg_type' => 'staff',
                'created_at' => $now,
            ]);

            // Log assignment
            static::assignmentLogTable()->insert([
                'ticket_id' => (int)$ticketId,
                'actor_id' => $adminId,
                'from_id' => null,
                'to_id' => $adminId,
                'created_at' => $now,
            ]);

            return ControllerTools::JSON(['success' => true, 'ticket_id' => (int)$ticketId]);
        }

        public static function post__reply(IGlobalReqParams $globals, IRouterUriParams $params): mixed {
            $result = parent::post__reply($globals, $params);

            if ($result->getStatusCode() !== 200) {
                return $result;
            }

            // After successful reply, create news event for ticket owner
            $ticketId = (int)$globals->readPostValue('ticket_id', '0');
            if ($ticketId > 0) {
                $ticket = static::ticketsTable()->selectOneByField('id', $ticketId);
                if ($ticket) {
                    $account = Account::fromSession();
                    NewsService::createPersonal(
                        NewsService::TYPE_SUPPORT_REPLY,
                        $account->id(),
                        (int)$ticket['account_id'],
                        [
                            'ticket_id' => $ticketId,
                            'subject' => $ticket['subject'] ?? '',
                        ]
                    );
                    EmailNotifications::supportReplyToUser((int)$ticket['account_id'], $ticketId, $ticket['subject'] ?? '');
                }
            }

            return $result;
        }

        /**
         * D-198: очередь обращений приходила один раз внутри HTML, и ничто на
         * странице не могло её перечитать. Модератор открывал обращение —
         * непрочитанное гасло на сервере, а пометка в очереди оставалась до
         * перезагрузки; отвечал — строка держала прежний статус. Тот же приём,
         * что и для карточки занятия в каталоге: отдельное чтение без условий,
         * ровно тех же данных, что и при первой отрисовке.
         */
        public static function post__ticketsList(IGlobalReqParams $globals, IRouterUriParams $params): mixed {
            if (!static::isModerator()) {
                return ControllerTools::JSON(['error' => 'Forbidden'], status: 403);
            }

            return ControllerTools::JSON(['tickets' => static::fetchTickets()]);
        }

        /**
         * D-209: чем живёт человек, который написал в поддержку, — его занятия
         * и его деньги.
         *
         * Обращение знает, кто его написал, но на экране об этом человеке не
         * было ничего, кроме имени. Чтобы ответить по существу — «что с моей
         * бронью», «куда делись деньги» — модератор уходил в раздел «Брони» и
         * искал там по имени, на каждое обращение заново (замерено mod-1 на
         * тикете #23). Данные всё это время лежали в двух запросах отсюда.
         *
         * Живёт в приложении, а не во фреймворке: брони и баланс — понятия
         * IRabi, у фреймворкового модуля поддержки их нет и быть не должно.
         */
        public static function post__clientContext(IGlobalReqParams $globals, IRouterUriParams $params): mixed {
            if (!static::isModerator()) {
                return ControllerTools::JSON(['error' => 'Forbidden'], status: 403);
            }

            $ticketId = (int)$globals->readPostValue('ticket_id', '0');
            if ($ticketId <= 0) {
                return ControllerTools::JSON(['error' => 'Invalid params'], status: 400);
            }

            $ticket = SupportTickets::get()->selectOneByField('id', $ticketId);
            if (!$ticket) {
                return ControllerTools::JSON(['error' => 'Ticket not found'], status: 404);
            }

            $accountId = (int)($ticket['account_id'] ?? 0);
            if ($accountId <= 0) {
                return ControllerTools::JSON(['balance' => 0, 'bookings' => [], 'ledger' => []]);
            }

            return ControllerTools::JSON([
                'balance' => AccountBalance::getBalance($accountId),
                'bookings' => static::clientBookings($accountId),
                'ledger' => static::clientLedger($accountId),
            ]);
        }

        /**
         * Последние занятия человека — столько, сколько нужно, чтобы узнать
         * ту самую бронь, про которую он пишет, и не больше: длинный список на
         * этом экране пришлось бы снова читать глазами.
         *
         * @return list<array{id:int,status:string,start_at:int,duration_min:int,cost:int,expert_name:string,is_group:bool}>
         */
        private static function clientBookings(int $accountId, int $limit = 5): array {
            $rows = Bookings::get()->selectAll(function (SelectInterface $q) use ($accountId, $limit): void {
                $q->where('user_id = ?', [$accountId])
                    ->where("bookable_type = 'time_slot'")
                    ->orderBy(['created_at DESC'])
                    ->limit($limit);
            });

            if (empty($rows)) {
                return [];
            }

            $slotIds = array_values(array_unique(array_map(
                static fn (array $b): int => (int)$b['bookable_id'],
                $rows,
            )));

            $slots = [];
            foreach (TimeSlots::get()->selectAll(function (SelectInterface $q) use ($slotIds): void {
                $q->where('id IN (?)', [$slotIds]);
            }) as $slot) {
                $slots[(int)$slot['id']] = $slot;
            }

            $expertIds = array_values(array_unique(array_filter(array_map(
                static fn (array $s): int => (int)($s['expert_id'] ?? 0),
                $slots,
            ))));

            $expertNames = [];
            if (!empty($expertIds)) {
                foreach (Account::getAccounts(
                    selectCallback: static function (SelectInterface $select) use ($expertIds): void {
                        $select->resetCols();
                        $select->cols(['id', 'name']);
                        $select->where('id IN (?)', [array_map('intval', $expertIds)]);
                    },
                ) as $acc) {
                    $expertNames[(int)$acc['id']] = (string)($acc['name'] ?? '');
                }
            }

            $out = [];
            foreach ($rows as $b) {
                $slot = $slots[(int)$b['bookable_id']] ?? null;
                $expertId = (int)($slot['expert_id'] ?? 0);
                $maxUsers = (int)($slot['max_users'] ?? 1);

                $out[] = [
                    'id' => (int)$b['id'],
                    'status' => (string)$b['status'],
                    'start_at' => (int)($slot['start_at'] ?? 0),
                    'duration_min' => (int)($slot['duration_min'] ?? 0),
                    'cost' => (int)($slot['cost'] ?? 0),
                    'expert_name' => $expertNames[$expertId] ?? '',
                    // Групповое занятие объясняет часть вопросов само по себе
                    // («почему место заняли»), поэтому видно сразу.
                    'is_group' => $maxUsers > 1,
                ];
            }

            return $out;
        }

        /**
         * Последние движения денег. Именно они превращают «деньги пропали» в
         * «вот списание, вот возврат, вот их даты».
         *
         * @return list<array{id:int,is_credit:bool,amount:int,entry_type:string,note:string,created_at:int}>
         */
        private static function clientLedger(int $accountId, int $limit = 5): array {
            $rows = BalanceLedger::get()->selectAll(function (SelectInterface $q) use ($accountId, $limit): void {
                $q->where('account_id = ?', [$accountId])
                    ->orderBy(['created_at DESC', 'id DESC'])
                    ->limit($limit);
            });

            return array_map(static fn (array $r): array => [
                'id' => (int)$r['id'],
                'is_credit' => (int)$r['is_credit'] === 1,
                'amount' => (int)$r['amount'],
                'entry_type' => (string)$r['entry_type'],
                'note' => (string)($r['note'] ?? ''),
                'created_at' => (int)$r['created_at'],
            ], $rows);
        }

        public static function get__main(IGlobalReqParams $globals, IRouterUriParams $params): mixed {
            if (!static::isModerator()) {
                return ControllerTools::redirect(IRabi::url('/'));
            }

            $url = $globals->getUri();
            $t = ForegroundI18n::getInstance();

            $content = RenderIsland::render('admin-support', [
                'tickets' => static::fetchTickets(),
                'gridConfig' => GridConfig::make(
                    columns: [
                        GridConfig::col('id', 'ID'),
                        GridConfig::col('subject', $t->Support_Subject()),
                        GridConfig::col('user_login', $t->Support_User()),
                        GridConfig::col('status', $t->Slot_Status()),
                        // D-201: колонка отвечает на вопрос «этот тикет ждёт
                        // ответа или ответ уже написан и лежит внутри?».
                        // Раньше и то и другое выглядело как «Эскалирован».
                        GridConfig::col('relay_label', $t->Support_InternalNewer(), shrink: true),
                        GridConfig::col('assignee_name', $t->Support_Assignee()),
                        // #392, подтверждено четырежды: возраст обращения не
                        // показывался нигде, и «висит почти неделю» можно было
                        // узнать только вычитая даты вручную.
                        GridConfig::col('created_label', $t->Support_Created()),
                        GridConfig::col('waiting_label', $t->Support_Waiting(), shrink: true),
                        GridConfig::col('updated_at', $t->Support_Updated()),
                    ],
                    searchFields: ['subject', 'user_login', 'user_name', 'status', 'assignee_name'],
                    // Сортировка по created_at, а не по created_label: в метке
                    // строка вида «15.09.2026 13:32», и сортировка по ней
                    // выстроит обращения по дню месяца.
                    sortFields: ['id', 'status', 'created_at', 'updated_at', 'assignee_name'],
                    pageSize: PaginationHelper::DEFAULT_PER_PAGE,
                ),
                'ticketsListUrl' => IRabi::url(static::URL . '~ticketsList'),
                'ticketDetailUrl' => IRabi::url(static::URL . '~ticketDetail'),
                // D-209: занятия и деньги человека, написавшего в поддержку.
                'clientContextUrl' => IRabi::url(static::URL . '~clientContext'),
                'replyUrl' => IRabi::url(static::URL . '~reply'),
                'internalCommentUrl' => IRabi::url(static::URL . '~internalComment'),
                'changeStatusUrl' => IRabi::url(static::URL . '~changeStatus'),
                'assignUrl' => IRabi::url(static::URL . '~assign'),
                'downloadUrl' => IRabi::url(static::URL . '~download'),
                'userDetailUrl' => IRabi::url('/admin/~userDetail'),
                'moderators' => static::fetchModerators(),
            ]);

            return ControllerTools::ok(HtmlLayout::render(
                TwigParams::init()->get(TwigParams::DEF_LAYOUT_PARAMS, [
                    'content' => $content,
                    'top_menu_items' => static::getMainMenu($url),
                    'side_menu_items' => static::getSideMenu($url),
                ])
            ));
        }
    }
}
