<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Dashboard\Controllers {
    use Aura\SqlQuery\Common\SelectInterface;
    use PHPCraftdream\Garnet\Bundle\Modules\Support\Controllers\FwSupportAdminController;
    use PHPCraftdream\Garnet\Bundle\Utils\HtmlLayout;
    use PHPCraftdream\Garnet\Bundle\Utils\RenderIsland;
    use PHPCraftdream\Garnet\Kernel\Db\Entity\Account\Account;
    use PHPCraftdream\Garnet\Kernel\Db\Entity\Account\DbAccount;
    use PHPCraftdream\Garnet\Kernel\Db\Tables\DbTable;
    use PHPCraftdream\Garnet\Kernel\Interfaces\IGlobalReqParams;
    use PHPCraftdream\Garnet\Kernel\Interfaces\Router\IRouterUriParams;
    use PHPCraftdream\Garnet\Kernel\Io\Router\ControllerTools;
    use PHPCraftdream\Garnet\Kernel\Io\Twig\TwigParams;
    use PHPCraftdream\IRabi\Common\PaginationHelper;
    use PHPCraftdream\IRabi\Common\Services\EmailNotifications;
    use PHPCraftdream\IRabi\Common\Services\NewsService;
    use PHPCraftdream\IRabi\Common\Tables\ExpertProfiles;
    use PHPCraftdream\IRabi\Common\Tables\SupportAssignmentLog;
    use PHPCraftdream\IRabi\Common\Tables\SupportAttachments;
    use PHPCraftdream\IRabi\Common\Tables\SupportMessages;
    use PHPCraftdream\IRabi\Common\Tables\SupportTickets;
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

            // Check if user has expert profile (IRabi-specific)
            $expertProfile = ExpertProfiles::get()->selectOneByField('account_id', $accountId);
            $hasExpertProfile = !empty($expertProfile);

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
                        GridConfig::col('assignee_name', $t->Support_Assignee()),
                        GridConfig::col('updated_at', $t->Support_Updated()),
                    ],
                    searchFields: ['subject', 'user_login', 'user_name', 'status', 'assignee_name'],
                    sortFields: ['id', 'status', 'updated_at', 'assignee_name'],
                    pageSize: PaginationHelper::DEFAULT_PER_PAGE,
                ),
                'ticketDetailUrl' => IRabi::url(static::URL . '~ticketDetail'),
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
