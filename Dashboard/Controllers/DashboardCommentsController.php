<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Dashboard\Controllers {
    use Aura\SqlQuery\Common\SelectInterface;
    use Closure;
    use DateTime;
    use DateTimeZone;
    use PHPCraftdream\Garnet\Kernel\Db\Entity\Account\Account;
    use PHPCraftdream\Garnet\Kernel\Interfaces\IGlobalReqParams;
    use PHPCraftdream\Garnet\Kernel\Interfaces\Router\IRouterUriParams;
    use PHPCraftdream\Garnet\Kernel\Io\Router\ControllerTools;
    use PHPCraftdream\IRabi\Common\PaginationHelper;
    use PHPCraftdream\IRabi\Common\Tables\AdminActionLog;
    use PHPCraftdream\IRabi\Common\Tables\Comments;
    use PHPCraftdream\IRabi\Common\Tables\ExpertProfiles;
    use PHPCraftdream\IRabi\IRabi;

    /**
     * Admin "Комментарии" page — журнал комментариев пользователей
     * с фильтрами и кнопкой soft-hide (is_hidden flag).
     *
     * Behind moderatorOnly middleware (registered in IRabi.php).
     */
    class DashboardCommentsController extends DashboardController {
        public const URL = '/admin/comments/';

        private const ENTITY_TYPE = Comments::ENTITY_EXPERT;

        // ── WHERE callback ─────────────────────────────────────────────────

        private static function commentsWhereCallback(
            int $authorId,
            int $expertId,
            int $dateFrom,
            int $dateTo,
            string $search,
            bool $hiddenOnly,
        ): Closure {
            return function (SelectInterface $query) use ($authorId, $expertId, $dateFrom, $dateTo, $search, $hiddenOnly): void {
                $query->where('entity_type = :etype', ['etype' => self::ENTITY_TYPE]);
                if ($authorId > 0) {
                    $query->where('author_id = :aid_filter', ['aid_filter' => $authorId]);
                }
                if ($expertId > 0) {
                    $query->where('entity_id = :eid_filter', ['eid_filter' => $expertId]);
                }
                if ($dateFrom > 0) {
                    $query->where('created_at >= :df_filter', ['df_filter' => $dateFrom]);
                }
                if ($dateTo > 0) {
                    $query->where('created_at <= :dt_filter', ['dt_filter' => $dateTo]);
                }
                if ($search !== '') {
                    $query->where('body LIKE :search_filter', ['search_filter' => '%' . $search . '%']);
                }
                if ($hiddenOnly) {
                    $query->where('is_hidden = :hidden_filter', ['hidden_filter' => 1]);
                }
                $query->orderBy(['created_at DESC', 'id DESC']);
            };
        }

        /**
         * Hydrate comment rows with author + expert names.
         *
         * @param list<array<string, mixed>> $rows
         * @return list<array<string, mixed>>
         */
        private static function hydrateCommentRows(array $rows): array {
            $accountIds = [];
            foreach ($rows as $row) {
                $accountIds[] = (int)($row['author_id'] ?? 0);
                $accountIds[] = (int)($row['entity_id'] ?? 0);
            }
            $accountIds = array_values(array_unique(array_filter($accountIds)));

            $accountInfo = [];
            if (!empty($accountIds)) {
                $accs = Account::getAccounts(
                    selectCallback: static function (SelectInterface $sel) use ($accountIds): void {
                        $sel->resetCols();
                        $sel->cols(['id', 'name', 'login', 'type']);
                        $sel->where('id IN (?)', [array_map('intval', $accountIds)]);
                    },
                );
                foreach ($accs as $a) {
                    $aid = (int)$a['id'];
                    $name = trim((string)($a['name'] ?? ''));
                    if ($name === '') {
                        $name = (string)($a['login'] ?? ('#' . $aid));
                    }
                    $accountInfo[$aid] = ['name' => $name, 'type' => (string)($a['type'] ?? '')];
                }
            }

            // Expert profiles for display_name override
            $expertIds = [];
            foreach ($rows as $row) {
                $expertIds[] = (int)($row['entity_id'] ?? 0);
            }
            $expertIds = array_values(array_unique(array_filter($expertIds)));

            $expertDisplay = [];
            if (!empty($expertIds)) {
                $profiles = ExpertProfiles::get()->selectAll(static function (SelectInterface $sel) use ($expertIds): void {
                    $sel->where('account_id IN (?)', [array_map('intval', $expertIds)]);
                });
                foreach ($profiles as $p) {
                    $aid = (int)($p['account_id'] ?? 0);
                    $disp = trim((string)($p['display_name'] ?? ''));
                    if ($aid > 0 && $disp !== '') {
                        $expertDisplay[$aid] = $disp;
                    }
                }
            }

            $out = [];
            foreach ($rows as $row) {
                $authorId = (int)($row['author_id'] ?? 0);
                $expertId = (int)($row['entity_id'] ?? 0);
                $authorInfo = $accountInfo[$authorId] ?? null;
                $expertInfo = $accountInfo[$expertId] ?? null;
                $expertName = $expertDisplay[$expertId] ?? ($expertInfo['name'] ?? ($expertId ? '#' . $expertId : '—'));

                $out[] = [
                    'id' => (int)($row['id'] ?? 0),
                    'author_id' => $authorId,
                    'author_name' => $authorInfo['name'] ?? ($authorId ? '#' . $authorId : '—'),
                    'entity_type' => (string)($row['entity_type'] ?? ''),
                    'entity_id' => $expertId,
                    'entity_name' => $expertName,
                    'expert_has_profile' => ($expertInfo['type'] ?? '') === 'expert',
                    'body' => (string)($row['body'] ?? ''),
                    'is_hidden' => (int)($row['is_hidden'] ?? 0) === 1,
                    'created_at' => (int)($row['created_at'] ?? 0),
                ];
            }
            return $out;
        }

        /**
         * @return array<string, mixed>
         */
        private static function buildCommentsPayload(
            int $page,
            int $perPage,
            int $authorId,
            int $expertId,
            int $dateFrom,
            int $dateTo,
            string $search,
            bool $hiddenOnly,
        ): array {
            $where = static::commentsWhereCallback($authorId, $expertId, $dateFrom, $dateTo, $search, $hiddenOnly);
            $pageData = PaginationHelper::fetchPage(Comments::get(), $page, $perPage, $where);
            $pageData->pageItems = static::hydrateCommentRows($pageData->pageItems);
            return PaginationHelper::toPageResponse($pageData);
        }

        /**
         * Parse a YYYY-MM-DD input into a UTC unixtime; 'start' uses 00:00:00, 'end' uses 23:59:59.
         */
        private static function parseDateInput(string $val, string $kind): int {
            if ($val === '') {
                return 0;
            }
            $tz = new DateTimeZone('UTC');
            $dt = DateTime::createFromFormat('Y-m-d', $val, $tz);
            if ($dt === false) {
                return 0;
            }
            if ($kind === 'end') {
                $dt->setTime(23, 59, 59);
            } else {
                $dt->setTime(0, 0, 0);
            }
            return $dt->getTimestamp();
        }

        /**
         * @return list<array{id:int, name:string}>
         */
        public static function loadExperts(): array {
            $accs = Account::getAccounts(
                selectCallback: static function (SelectInterface $sel): void {
                    $sel->resetCols();
                    $sel->cols(['id', 'name', 'login']);
                    $sel->where("type = 'expert'");
                    $sel->orderBy(['name ASC', 'login ASC']);
                },
            );

            // Override with expert profile display_name where present.
            $accountIds = array_values(array_filter(array_map(
                static fn (array $a): int => (int)($a['id'] ?? 0),
                $accs,
            )));
            $expertDisplay = [];
            if (!empty($accountIds)) {
                $profiles = ExpertProfiles::get()->selectAll(static function (SelectInterface $sel) use ($accountIds): void {
                    $sel->where('account_id IN (?)', [array_map('intval', $accountIds)]);
                });
                foreach ($profiles as $p) {
                    $aid = (int)($p['account_id'] ?? 0);
                    $disp = trim((string)($p['display_name'] ?? ''));
                    if ($aid > 0 && $disp !== '') {
                        $expertDisplay[$aid] = $disp;
                    }
                }
            }

            $out = [];
            foreach ($accs as $a) {
                $aid = (int)($a['id'] ?? 0);
                $name = $expertDisplay[$aid] ?? trim((string)($a['name'] ?? ''));
                if ($name === '') {
                    $name = (string)($a['login'] ?? ('#' . $aid));
                }
                $out[] = ['id' => $aid, 'name' => $name];
            }
            return $out;
        }

        /**
         * Load only authors who actually have comments — keeps the combobox
         * focused on relevant filter targets.
         *
         * @return list<array{id:int, name:string}>
         */
        public static function loadAuthors(): array {
            $rows = Comments::get()->selectAll(static function (SelectInterface $sel): void {
                $sel->resetCols();
                $sel->cols(['DISTINCT author_id AS author_id']);
                $sel->where('entity_type = ?', [self::ENTITY_TYPE]);
            });
            $ids = [];
            foreach ($rows as $r) {
                $aid = (int)($r['author_id'] ?? 0);
                if ($aid > 0) {
                    $ids[] = $aid;
                }
            }
            $ids = array_values(array_unique($ids));
            if (empty($ids)) {
                return [];
            }

            $accs = Account::getAccounts(
                selectCallback: static function (SelectInterface $sel) use ($ids): void {
                    $sel->resetCols();
                    $sel->cols(['id', 'name', 'login']);
                    $sel->where('id IN (?)', [array_map('intval', $ids)]);
                    $sel->orderBy(['name ASC', 'login ASC']);
                },
            );
            $out = [];
            foreach ($accs as $a) {
                $aid = (int)($a['id'] ?? 0);
                $name = trim((string)($a['name'] ?? ''));
                if ($name === '') {
                    $name = (string)($a['login'] ?? ('#' . $aid));
                }
                $out[] = ['id' => $aid, 'name' => $name];
            }
            return $out;
        }

        /**
         * @return array{authorId:int, expertId:int, dateFrom:int, dateTo:int, search:string, hiddenOnly:bool}
         */
        private static function readFilters(IGlobalReqParams $globals): array {
            $authorId = (int)$globals->readPostValue('author_id', 0);
            $expertId = (int)$globals->readPostValue('expert_id', 0);
            $dateFromRaw = trim((string)$globals->readPostValue('date_from', ''));
            $dateToRaw = trim((string)$globals->readPostValue('date_to', ''));
            $dateFrom = static::parseDateInput($dateFromRaw, 'start');
            $dateTo = static::parseDateInput($dateToRaw, 'end');
            $search = trim((string)$globals->readPostValue('search', ''));
            $hiddenOnlyRaw = $globals->readPostValue('hidden_only', '');
            $hiddenOnly = $hiddenOnlyRaw === '1' || $hiddenOnlyRaw === 'true' || $hiddenOnlyRaw === true;

            return [
                'authorId' => max(0, $authorId),
                'expertId' => max(0, $expertId),
                'dateFrom' => max(0, $dateFrom),
                'dateTo' => max(0, $dateTo),
                'search' => $search,
                'hiddenOnly' => (bool)$hiddenOnly,
            ];
        }

        // ── HTTP handlers ───────────────────────────────────────────────────

        public static function get__main(IGlobalReqParams $globals, IRouterUriParams $params): mixed {
            return ControllerTools::redirect(IRabi::url(DashboardUsersController::URL) . '?tab=comments');
        }

        /**
         * Build the initial comments page payload — used by DashboardUsersController
         * when the user lands on /admin/?tab=comments so the first paint is hydrated.
         *
         * @return array<string, mixed>
         */
        public static function initialCommentsPayload(): array {
            return static::buildCommentsPayload(
                page: 1,
                perPage: PaginationHelper::DEFAULT_PER_PAGE,
                authorId: 0,
                expertId: 0,
                dateFrom: 0,
                dateTo: 0,
                search: '',
                hiddenOnly: false,
            );
        }

        public static function post__commentsPage(IGlobalReqParams $globals, IRouterUriParams $params): mixed {
            if (!static::isModerator()) {
                return ControllerTools::JSON(['error' => 'Access denied'], status: 403);
            }
            ['page' => $page, 'perPage' => $perPage] = PaginationHelper::readPageParams($globals);
            $f = static::readFilters($globals);
            $payload = static::buildCommentsPayload(
                page: $page,
                perPage: $perPage,
                authorId: $f['authorId'],
                expertId: $f['expertId'],
                dateFrom: $f['dateFrom'],
                dateTo: $f['dateTo'],
                search: $f['search'],
                hiddenOnly: $f['hiddenOnly'],
            );
            return ControllerTools::JSON($payload);
        }

        public static function post__hide(IGlobalReqParams $globals, IRouterUriParams $params): mixed {
            return static::setHiddenFlag($globals, true);
        }

        public static function post__unhide(IGlobalReqParams $globals, IRouterUriParams $params): mixed {
            return static::setHiddenFlag($globals, false);
        }

        private static function setHiddenFlag(IGlobalReqParams $globals, bool $hidden): mixed {
            if (!static::isModerator()) {
                return ControllerTools::JSON(['error' => 'Access denied'], status: 403);
            }
            $commentId = (int)$globals->readPostValue('id', 0);
            if ($commentId <= 0) {
                return ControllerTools::JSON(['error' => 'Invalid params'], status: 400);
            }

            $comment = Comments::get()->selectOneByField('id', $commentId);
            if (!$comment) {
                return ControllerTools::JSON(['error' => 'Comment not found'], status: 404);
            }

            $oldValue = (int)($comment['is_hidden'] ?? 0);
            $newValue = $hidden ? 1 : 0;

            if ($oldValue !== $newValue) {
                Comments::get()->updateByField(
                    ['is_hidden' => $newValue],
                    'id',
                    $commentId,
                );

                $actor = Account::fromSession();
                if ($actor !== null) {
                    AdminActionLog::get()->writeLog(
                        actorId: (int)$actor->readParam('id'),
                        actorLogin: (string)$actor->readParam('login'),
                        targetId: $commentId,
                        targetLogin: 'comment#' . $commentId,
                        action: $hidden ? 'COMMENT_HIDE' : 'COMMENT_UNHIDE',
                        oldValue: (string)$oldValue,
                        newValue: (string)$newValue,
                    );
                }
            }

            return ControllerTools::JSON([
                'success' => true,
                'id' => $commentId,
                'is_hidden' => $newValue === 1,
            ]);
        }
    }
}
