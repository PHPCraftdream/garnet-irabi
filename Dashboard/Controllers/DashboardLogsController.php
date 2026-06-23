<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Dashboard\Controllers {
    use Aura\SqlQuery\Common\SelectInterface;
    use PHPCraftdream\Garnet\Bundle\Modules\Logging\Admin\Tables\FwAdminActionLog;
    use PHPCraftdream\Garnet\Bundle\Modules\Logging\Mail\Tables\FwMailLog;
    use PHPCraftdream\Garnet\Bundle\Modules\Logging\Viewer\Controllers\FwDashboardLogsViewerController;
    use PHPCraftdream\Garnet\Kernel\Db\Entity\Account\Account;
    use PHPCraftdream\Garnet\Kernel\Interfaces\IGlobalReqParams;
    use PHPCraftdream\Garnet\Kernel\Interfaces\Router\IRouterUriParams;
    use PHPCraftdream\Garnet\Kernel\Io\Router\ControllerTools;
    use PHPCraftdream\IRabi\Common\PaginationHelper;
    use PHPCraftdream\IRabi\Common\Tables\AdminActionLog;
    use PHPCraftdream\IRabi\Common\Tables\CronLog;
    use PHPCraftdream\IRabi\Common\Tables\JsErrors;
    use PHPCraftdream\IRabi\Common\Tables\MailLog;
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
            $cronLogs = $activeTab === self::TAB_CRON ? static::fetchCronLogs() : [];
            $jsErrorLogs = $activeTab === self::TAB_JS_ERRORS ? static::fetchJsErrors() : [];
            return [
                'cron' => [
                    'logs' => $cronLogs,
                    'loaded' => $activeTab === self::TAB_CRON,
                ],
                'jsErrors' => [
                    'logs' => $jsErrorLogs,
                    'loaded' => $activeTab === self::TAB_JS_ERRORS,
                ],
            ];
        }

        /**
         * @return array<int, array<string, mixed>>
         */
        protected static function fetchCronLogs(int $limit = 200): array {
            $rows = CronLog::get()->selectAll(static function (SelectInterface $query) use ($limit): void {
                $query->orderBy(['id DESC']);
                $query->limit($limit);
            });

            // Normalize numeric columns to int (DbTable returns strings for INT columns).
            foreach ($rows as &$row) {
                $row['id'] = (int)($row['id'] ?? 0);
                $row['started_at'] = (int)($row['started_at'] ?? 0);
                $row['finished_at'] = (int)($row['finished_at'] ?? 0);
                $row['duration_ms'] = (int)($row['duration_ms'] ?? 0);
                $row['created_at'] = (int)($row['created_at'] ?? 0);
            }
            return $rows;
        }

        /**
         * @return array<int, array<string, mixed>>
         */
        protected static function fetchJsErrors(int $limit = 200): array {
            $rows = JsErrors::get()->selectAll(static function (SelectInterface $query) use ($limit): void {
                $query->orderBy(['last_seen_at DESC', 'id DESC']);
                $query->limit($limit);
            });

            // Normalize numeric columns + nulls.
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

            // Hydrate account_name for non-null account_ids.
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

            return $rows;
        }

        public static function post__cronPage(IGlobalReqParams $globals, IRouterUriParams $params): mixed {
            if (!static::isModerator()) {
                return ControllerTools::JSON(['error' => 'Access denied'], status: 403);
            }
            return ControllerTools::JSON([
                'logs' => static::fetchCronLogs(),
            ]);
        }

        public static function post__jsErrorsPage(IGlobalReqParams $globals, IRouterUriParams $params): mixed {
            if (!static::isModerator()) {
                return ControllerTools::JSON(['error' => 'Access denied'], status: 403);
            }
            return ControllerTools::JSON([
                'logs' => static::fetchJsErrors(),
            ]);
        }
    }
}
