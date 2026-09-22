<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Dashboard\Controllers\Ops {
    use Aura\SqlQuery\Common\SelectInterface;
    use PHPCraftdream\Garnet\Bundle\Modules\Ops\Logging\Admin\Tables\FwAdminActionLog;
    use PHPCraftdream\Garnet\Bundle\Modules\Ops\Logging\Mail\Tables\FwMailLog;
    use PHPCraftdream\Garnet\Bundle\Modules\Ops\Logging\Viewer\Controllers\FwDashboardLogsViewerController;
    use PHPCraftdream\Garnet\Kernel\Db\Entity\Account\Account;
    use PHPCraftdream\Garnet\Kernel\Interfaces\Core\IGlobalReqParams;
    use PHPCraftdream\Garnet\Kernel\Interfaces\Web\Router\IRouterUriParams;
    use PHPCraftdream\Garnet\Kernel\Io\Http\Router\Controller\ControllerTools;
    use PHPCraftdream\IRabi\Common\Support\PaginationHelper;
    use PHPCraftdream\IRabi\Common\Tables\Mail\MailLog;
    use PHPCraftdream\IRabi\Common\Tables\Ops\AdminActionLog;
    use PHPCraftdream\IRabi\Common\Tables\Ops\CronLog;
    use PHPCraftdream\IRabi\Common\Tables\Ops\JsErrors;
    use PHPCraftdream\IRabi\Dashboard\GridConfig;
    use PHPCraftdream\IRabi\Dashboard\IrabiDashboardMenuTrait;
    use PHPCraftdream\IRabi\Foreground\I18n\ForegroundI18n;
    use PHPCraftdream\IRabi\Foreground\Params\UserEntityConfig;
    use PHPCraftdream\IRabi\IRabi;

    /**
     * Unified IRabi logs viewer at /admin/logs/.
     * Renders 6 tabs: actions / mails / requests / errors / cron / js-errors.
     */
    class DashboardLogsController extends FwDashboardLogsViewerController {
        use IrabiDashboardMenuTrait;

        public const URL = '/admin/logs/';
        public const TAB_CRON = 'cron';
        public const TAB_JS_ERRORS = 'js-errors';

        protected static function pageUrl(): string {
            return IRabi::url(self::URL);
        }

        protected static function isAdmin(): bool {
            return UserEntityConfig::isAdmin();
        }

        protected static function actionLogTable(): FwAdminActionLog {
            return AdminActionLog::get();
        }

        protected static function actionsGridConfig(): array {
            $t = ForegroundI18n::getInstance();
            return GridConfig::make(
                columns: [
                    GridConfig::col('created_at',   $t->Admin_Log_CreatedAt()),
                    GridConfig::col('actor_login',  $t->Admin_Log_Actor()),
                    GridConfig::col('target_login', $t->Admin_Log_Target()),
                    GridConfig::col('action',       $t->Admin_Log_Action()),
                    GridConfig::col('old_value',    $t->Admin_Log_OldValue()),
                    GridConfig::col('new_value',    $t->Admin_Log_NewValue()),
                ],
                searchFields: ['actor_login', 'actor_name', 'target_login', 'target_name', 'action'],
                sortFields:   ['id', 'actor_id', 'target_id', 'created_at'],
                pageSize:     PaginationHelper::DEFAULT_PER_PAGE,
            );
        }

        protected static function mailLogTable(): FwMailLog {
            return MailLog::get();
        }

        protected static function mailsGridConfig(): array {
            $t = ForegroundI18n::getInstance();

            $searchFields = ['recipient_email', 'account_name', 'account_login', 'mail_type', 'subject', 'status', 'error_log'];
            if (static::isAdmin()) {
                $searchFields[] = 'body_html';
                $searchFields[] = 'meta';
            }

            return GridConfig::make(
                columns: [
                    GridConfig::col('created_at',     $t->Admin_MailLog_Date()),
                    GridConfig::col('recipient_email',$t->Admin_MailLog_Recipient()),
                    GridConfig::col('mail_type',      $t->Admin_MailLog_Type()),
                    GridConfig::col('subject',        $t->Admin_MailLog_Subject()),
                    GridConfig::col('status',         $t->Admin_MailLog_Status()),
                    GridConfig::col('error_log',      $t->Admin_MailLog_Error()),
                ],
                searchFields: $searchFields,
                sortFields:   ['id', 'created_at', 'mail_type', 'status'],
                pageSize:     PaginationHelper::DEFAULT_PER_PAGE,
            );
        }

        // ────────────────── Cron + JS errors tabs ──────────────────

        /** @return array<int, string> */
        protected static function extraTabs(): array {
            return [self::TAB_CRON, self::TAB_JS_ERRORS];
        }

        /** @return array<string, string> */
        protected static function extraEndpoints(): array {
            return [
                self::TAB_CRON => static::endpointUrl('cronPage'),
                self::TAB_JS_ERRORS => static::endpointUrl('jsErrorsPage'),
            ];
        }

        /**
         * @return array<string, mixed>
         */
        protected static function extraInitialData(string $activeTab): array {
            return [
                'cron' => [
                    'payload' => $activeTab === self::TAB_CRON ? static::fetchCronLogsPage() : null,
                    'filterOptions' => static::fetchCronFilterOptions(),
                ],
                'jsErrors' => [
                    'payload' => $activeTab === self::TAB_JS_ERRORS ? static::fetchJsErrorsPage() : null,
                    'filterOptions' => static::fetchJsErrorsFilterOptions(),
                ],
            ];
        }

        /**
         * @param array{taskName?: string, dateFrom?: int, dateTo?: int} $filters
         * @return array<string, mixed> PageResponse shape
         */
        protected static function fetchCronLogsPage(
            int $page = 1,
            int $perPage = 10,
            string $query = '',
            ?string $sortField = null,
            string $sortDir = 'asc',
            array $filters = [],
        ): array {
            $searchFields = ['task_name', 'status', 'output', 'error_message'];
            $sortFields = ['id', 'started_at', 'duration_ms', 'task_name', 'status'];

            $pageData = PaginationHelper::fetchPage(
                CronLog::get(),
                $page,
                $perPage,
                static function (SelectInterface $q) use ($query, $sortField, $sortDir, $searchFields, $sortFields, $filters): void {
                    if (isset($filters['taskName']) && $filters['taskName'] !== '') {
                        $q->where('task_name = :flt_task', ['flt_task' => $filters['taskName']]);
                    }
                    if (isset($filters['dateFrom'])) {
                        $q->where('started_at >= :flt_from', ['flt_from' => $filters['dateFrom']]);
                    }
                    if (isset($filters['dateTo'])) {
                        $q->where('started_at <= :flt_to', ['flt_to' => $filters['dateTo']]);
                    }
                    PaginationHelper::applySearchAndSort($q, $query, $searchFields, $sortField, $sortDir, $sortFields);
                },
            );

            foreach ($pageData->pageItems as &$row) {
                $row['id'] = (int)($row['id'] ?? 0);
                $row['started_at'] = (int)($row['started_at'] ?? 0);
                $row['finished_at'] = (int)($row['finished_at'] ?? 0);
                $row['duration_ms'] = (int)($row['duration_ms'] ?? 0);
                $row['created_at'] = (int)($row['created_at'] ?? 0);
            }
            unset($row);

            return PaginationHelper::toPageResponse($pageData);
        }

        /** @return array{taskNames: list<string>} */
        protected static function fetchCronFilterOptions(): array {
            $taskNames = array_map('strval', array_column(
                CronLog::get()->selectAll(static function (SelectInterface $q): void {
                    $q->resetCols();
                    $q->cols(['DISTINCT task_name AS task_name']);
                }),
                'task_name',
            ));
            sort($taskNames);
            return ['taskNames' => $taskNames];
        }

        /**
         * @param array{accountId?: int, file?: string, dateFrom?: int, dateTo?: int} $filters
         * @return array<string, mixed> PageResponse shape
         */
        protected static function fetchJsErrorsPage(
            int $page = 1,
            int $perPage = 10,
            string $query = '',
            ?string $sortField = null,
            string $sortDir = 'asc',
            array $filters = [],
        ): array {
            // account_name is hydrated after the query below, not a real
            // column — LIKE-searching it here would error. The account
            // dropdown filter (accountId, server-side) covers that axis.
            $searchFields = ['message', 'file', 'url'];
            $sortFields = ['id', 'last_seen_at', 'first_seen_at', 'count'];

            $pageData = PaginationHelper::fetchPage(
                JsErrors::get(),
                $page,
                $perPage,
                static function (SelectInterface $q) use ($query, $sortField, $sortDir, $searchFields, $sortFields, $filters): void {
                    if (isset($filters['accountId'])) {
                        $q->where('account_id = :flt_account', ['flt_account' => $filters['accountId']]);
                    }
                    if (isset($filters['file']) && $filters['file'] !== '') {
                        $q->where('file = :flt_file', ['flt_file' => $filters['file']]);
                    }
                    if (isset($filters['dateFrom'])) {
                        $q->where('last_seen_at >= :flt_from', ['flt_from' => $filters['dateFrom']]);
                    }
                    if (isset($filters['dateTo'])) {
                        $q->where('last_seen_at <= :flt_to', ['flt_to' => $filters['dateTo']]);
                    }
                    // account_name isn't a real column (hydrated below) — LIKE on
                    // it via applySearchAndSort would error, so it's excluded from
                    // searchFields at the SQL layer despite the JS type declaring it.
                    PaginationHelper::applySearchAndSort($q, $query, $searchFields, $sortField, $sortDir, $sortFields);
                },
            );

            $rows = $pageData->pageItems;

            foreach ($rows as &$row) {
                $row['id'] = (int)($row['id'] ?? 0);
                $row['line'] = (int)($row['line'] ?? 0);
                $row['col'] = (int)($row['col'] ?? 0);
                $row['count'] = (int)($row['count'] ?? 0);
                $row['first_seen_at'] = (int)($row['first_seen_at'] ?? 0);
                $row['last_seen_at'] = (int)($row['last_seen_at'] ?? 0);
                $row['account_id'] = $row['account_id'] !== null
                    ? (int)$row['account_id']
                    : null;
            }
            unset($row);

            $accountIds = array_unique(array_filter(
                array_column($rows, 'account_id'),
                static fn ($id) => is_int($id) && $id > 0,
            ));

            $accounts = [];
            if (!empty($accountIds)) {
                $accs = Account::getAccounts(
                    selectCallback: static function (SelectInterface $select) use ($accountIds): void {
                        $select->resetCols();
                        $select->cols(['id', 'login', 'name']);
                        $select->where('id IN (?)', [array_map('intval', $accountIds)]);
                    },
                );
                foreach ($accs as $a) {
                    $accounts[(int)$a['id']] = $a;
                }
            }

            foreach ($rows as &$row) {
                $aid = $row['account_id'];
                if (is_int($aid) && isset($accounts[$aid])) {
                    $acc = $accounts[$aid];
                    $row['account_name'] = (string)($acc['name'] ?? $acc['login'] ?? '');
                } else {
                    $row['account_name'] = '';
                }
            }
            unset($row);

            $pageData->pageItems = $rows;
            return PaginationHelper::toPageResponse($pageData);
        }

        /** @return array{accounts: list<array{id: int, name: string}>, files: list<string>} */
        protected static function fetchJsErrorsFilterOptions(): array {
            $accountIds = array_map('intval', array_filter(array_column(
                JsErrors::get()->selectAll(static function (SelectInterface $q): void {
                    $q->resetCols();
                    $q->cols(['DISTINCT account_id AS account_id']);
                    $q->where('account_id IS NOT NULL');
                }),
                'account_id',
            )));

            $accounts = [];
            if (!empty($accountIds)) {
                $accs = Account::getAccounts(
                    selectCallback: static function (SelectInterface $select) use ($accountIds): void {
                        $select->resetCols();
                        $select->cols(['id', 'login', 'name']);
                        $select->where('id IN (?)', [$accountIds]);
                    },
                );
                foreach ($accs as $a) {
                    $accounts[] = ['id' => (int)$a['id'], 'name' => (string)($a['name'] ?? $a['login'] ?? ('#' . $a['id']))];
                }
                usort($accounts, static fn (array $a, array $b): int => strcmp($a['name'], $b['name']));
            }

            $files = array_map('strval', array_column(
                JsErrors::get()->selectAll(static function (SelectInterface $q): void {
                    $q->resetCols();
                    $q->cols(['DISTINCT file AS file']);
                }),
                'file',
            ));
            sort($files);

            return ['accounts' => $accounts, 'files' => $files];
        }

        public static function post__cronPage(IGlobalReqParams $globals, IRouterUriParams $params): mixed {
            if (!static::isModerator()) {
                return ControllerTools::JSON(['error' => 'Access denied'], status: 403);
            }
            ['page' => $page, 'perPage' => $perPage] = PaginationHelper::readPageParams($globals);
            ['query' => $query, 'sortField' => $sortField, 'sortDir' => $sortDir] = PaginationHelper::readSearchSortParams($globals);
            $filters = [];
            $taskName = trim((string)$globals->readPostValue('taskName', ''));
            if ($taskName !== '') {
                $filters['taskName'] = $taskName;
            }
            $dateFrom = (int)$globals->readPostValue('dateFrom', 0);
            if ($dateFrom > 0) {
                $filters['dateFrom'] = $dateFrom;
            }
            $dateTo = (int)$globals->readPostValue('dateTo', 0);
            if ($dateTo > 0) {
                $filters['dateTo'] = $dateTo;
            }

            return ControllerTools::JSON(static::fetchCronLogsPage($page, $perPage, $query, $sortField, $sortDir, $filters));
        }

        public static function post__jsErrorsPage(IGlobalReqParams $globals, IRouterUriParams $params): mixed {
            if (!static::isModerator()) {
                return ControllerTools::JSON(['error' => 'Access denied'], status: 403);
            }
            ['page' => $page, 'perPage' => $perPage] = PaginationHelper::readPageParams($globals);
            ['query' => $query, 'sortField' => $sortField, 'sortDir' => $sortDir] = PaginationHelper::readSearchSortParams($globals);
            $filters = [];
            $accountId = (int)$globals->readPostValue('accountId', 0);
            if ($accountId > 0) {
                $filters['accountId'] = $accountId;
            }
            $file = trim((string)$globals->readPostValue('file', ''));
            if ($file !== '') {
                $filters['file'] = $file;
            }
            $dateFrom = (int)$globals->readPostValue('dateFrom', 0);
            if ($dateFrom > 0) {
                $filters['dateFrom'] = $dateFrom;
            }
            $dateTo = (int)$globals->readPostValue('dateTo', 0);
            if ($dateTo > 0) {
                $filters['dateTo'] = $dateTo;
            }

            return ControllerTools::JSON(static::fetchJsErrorsPage($page, $perPage, $query, $sortField, $sortDir, $filters));
        }
    }
}
