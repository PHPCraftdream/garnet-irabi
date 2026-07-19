<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Dashboard\Controllers {
    use Aura\SqlQuery\Common\SelectInterface;
    use PHPCraftdream\Garnet\Bundle\Modules\Email\FwEmailQueueService;
    use PHPCraftdream\Garnet\Bundle\Utils\HtmlLayout;
    use PHPCraftdream\Garnet\Bundle\Utils\RenderIsland;
    use PHPCraftdream\Garnet\Kernel\Interfaces\IGlobalReqParams;
    use PHPCraftdream\Garnet\Kernel\Interfaces\Router\IRouterUriParams;
    use PHPCraftdream\Garnet\Kernel\Io\Router\ControllerTools;
    use PHPCraftdream\Garnet\Kernel\Io\Twig\TwigParams;
    use PHPCraftdream\IRabi\Common\Tables\EmailQueue;
    use PHPCraftdream\IRabi\Dashboard\GridConfig;
    use PHPCraftdream\IRabi\Dashboard\IrabiDashboardMenuTrait;
    use PHPCraftdream\IRabi\Foreground\I18n\ForegroundI18n;
    use PHPCraftdream\IRabi\Foreground\Params\UserEntityConfig;
    use PHPCraftdream\IRabi\IRabi;

    /**
     * Admin-only viewer for the outbound email queue (email_queue, NOT
     * mail_log) with a manual "retry" action for dead-letter rows.
     *
     * Audit 09 / H-3: the framework's automatic retry window is short
     * (~75s after the max_attempts raise) and once a row hits the
     * terminal dead-letter state (status='error', next_attempt_at=NULL)
     * the cron driver never touches it again. This page gives the admin
     * visibility into queue state + a one-click manual retry.
     *
     * Access is restricted to full admins (IS_ADMIN) — stricter than the
     * moderator-gated logs viewer, because the retry action re-arms email
     * sending.
     */
    class DashboardEmailQueueController extends DashboardController {
        use IrabiDashboardMenuTrait;

        public const URL = '/admin/email-queue/';

        /** Rows shown per page load / refresh (most recent first). */
        private const LIST_LIMIT = 200;

        protected static function isAdmin(): bool {
            return UserEntityConfig::isAdmin();
        }

        /**
         * Dead-letter rows: terminally failed (status='error') with no
         * scheduled retry (next_attempt_at IS NULL). These are the rows
         * the cron driver will never pick up again on its own.
         */
        private static function deadLetterCount(): int {
            return EmailQueue::get()->getCount(static function (SelectInterface $q): void {
                $q->where("status = 'error'");
                $q->where('next_attempt_at IS NULL');
            });
        }

        /**
         * @return array<int, array<string, mixed>>
         */
        private static function fetchRows(int $limit = self::LIST_LIMIT): array {
            // Select only the columns we render — body_html is LONGTEXT and
            // would bloat the island payload for no UI benefit.
            $rows = EmailQueue::get()->selectAll(static function (SelectInterface $q) use ($limit): void {
                $q->resetCols();
                $q->cols([
                    'id', 'recipient_email', 'subject', 'status',
                    'attempts', 'max_attempts', 'next_attempt_at',
                    'sent_at', 'created_at',
                ]);
                $q->orderBy(['id DESC']);
                $q->limit($limit);
            });

            foreach ($rows as &$row) {
                $row['id'] = (int)$row['id'];
                $row['attempts'] = (int)($row['attempts'] ?? 0);
                $row['max_attempts'] = (int)($row['max_attempts'] ?? 0);
                $row['next_attempt_at'] = isset($row['next_attempt_at'])
                    ? (int)$row['next_attempt_at']
                    : null;
                $row['sent_at'] = isset($row['sent_at']) ? (int)$row['sent_at'] : null;
                $row['created_at'] = (int)($row['created_at'] ?? 0);
            }
            unset($row);

            return $rows;
        }

        private static function gridConfig(): array {
            $t = ForegroundI18n::getInstance();
            return GridConfig::make(
                columns: [
                    GridConfig::col('created_at',      $t->Admin_Log_CreatedAt()),
                    GridConfig::col('recipient_email', $t->Admin_MailLog_Recipient()),
                    GridConfig::col('subject',         $t->Admin_MailLog_Subject()),
                    GridConfig::col('status',          $t->Admin_MailLog_Status()),
                    GridConfig::col('attempts',        $t->Admin_EmailQueue_Attempts()),
                    GridConfig::col('max_attempts',    $t->Admin_EmailQueue_MaxAttempts()),
                    GridConfig::col('next_attempt_at', $t->Admin_EmailQueue_NextAttempt()),
                ],
                searchFields: ['recipient_email', 'subject', 'status'],
                sortFields:   ['id', 'created_at', 'status'],
                pageSize:     self::LIST_LIMIT,
            );
        }

        public static function get__main(IGlobalReqParams $globals, IRouterUriParams $params): mixed {
            if (!static::isAdmin()) {
                return ControllerTools::redirect(IRabi::url('/'));
            }

            $url = $globals->getUri();
            $t = ForegroundI18n::getInstance();

            $content = RenderIsland::render('admin-email-queue', [
                'rows' => static::fetchRows(),
                'gridConfig' => static::gridConfig(),
                'deadLetterCount' => static::deadLetterCount(),
                'retryUrl' => IRabi::url(static::URL . '~retry'),
                'labels' => [
                    'title' => $t->Admin_EmailQueue_Title(),
                    'deadLetter' => $t->Admin_EmailQueue_DeadLetterBanner(),
                    'empty' => $t->Admin_EmailQueue_Empty(),
                    'retry' => $t->Admin_EmailQueue_Retry(),
                    'retryDone' => $t->Admin_EmailQueue_RetryDone(),
                    'retryFail' => $t->Admin_EmailQueue_RetryFail(),
                ],
            ]);

            return ControllerTools::ok(HtmlLayout::render(
                TwigParams::init()->get(TwigParams::DEF_LAYOUT_PARAMS, [
                    'content' => $content,
                    'top_menu_items' => static::getMainMenu($url),
                    'side_menu_items' => static::getSideMenu($url),
                ])
            ));
        }

        /**
         * Manually re-arm a queue row for sending.
         *
         * Calls FwEmailQueueService::retry($id) (which flips status→'queued'
         * and next_attempt_at→now, refusing already-sent rows), then resets
         * attempts to 0. The attempts reset is required for retry to be
         * functional on terminal dead-letter rows: processQueue() only
         * selects rows WHERE `attempts < max_attempts`, and retry() alone
         * leaves attempts at max_attempts — so without the reset a retried
         * dead-letter row would sit in 'queued' forever, never re-sent.
         */
        public static function post__retry(IGlobalReqParams $globals, IRouterUriParams $params): mixed {
            if (!static::isAdmin()) {
                return ControllerTools::JSON(['error' => 'Access denied'], status: 403);
            }

            $id = (int)$globals->readPostValue('id', '0');
            if ($id <= 0) {
                return ControllerTools::JSON(['error' => 'Invalid id'], status: 400);
            }

            $ok = FwEmailQueueService::retry($id);
            if (!$ok) {
                return ControllerTools::JSON(['success' => false, 'deadLetterCount' => static::deadLetterCount()]);
            }

            // Give the row a fresh attempt budget so the cron driver
            // actually re-processes it (see method docblock).
            EmailQueue::get()->updateById(['attempts' => 0], $id);

            $row = EmailQueue::get()->selectById($id);
            if (!empty($row)) {
                $row['id'] = (int)$row['id'];
                $row['attempts'] = (int)($row['attempts'] ?? 0);
                $row['max_attempts'] = (int)($row['max_attempts'] ?? 0);
                $row['next_attempt_at'] = isset($row['next_attempt_at'])
                    ? (int)$row['next_attempt_at']
                    : null;
                $row['sent_at'] = isset($row['sent_at']) ? (int)$row['sent_at'] : null;
                $row['created_at'] = (int)($row['created_at'] ?? 0);
            }

            return ControllerTools::JSON([
                'success' => true,
                'row' => $row ?: null,
                'deadLetterCount' => static::deadLetterCount(),
            ]);
        }
    }
}
