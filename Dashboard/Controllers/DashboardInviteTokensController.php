<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Dashboard\Controllers {
    use Aura\SqlQuery\Common\SelectInterface;
    use PHPCraftdream\Garnet\Bundle\Modules\EntityHistory\EntityHistoryService;
    use PHPCraftdream\Garnet\Bundle\Modules\Invite\FwInviteTokenService;
    use PHPCraftdream\Garnet\Kernel\Db\Entity\Account\Account;
    use PHPCraftdream\Garnet\Kernel\Db\Entity\Account\DbAccount;
    use PHPCraftdream\Garnet\Kernel\Interfaces\IGlobalReqParams;
    use PHPCraftdream\Garnet\Kernel\Interfaces\Router\IRouterUriParams;
    use PHPCraftdream\Garnet\Kernel\Io\IniConfig\AppConfig;
    use PHPCraftdream\Garnet\Kernel\Io\IniConfig\IniConfig;
    use PHPCraftdream\Garnet\Kernel\Io\Router\ControllerTools;
    use PHPCraftdream\IRabi\Common\System\DateUtils;
    use PHPCraftdream\IRabi\Common\Tables\EntityHistory;
    use PHPCraftdream\IRabi\Common\Tables\InviteRegistrations;
    use PHPCraftdream\IRabi\Common\Tables\InviteTokens;
    use PHPCraftdream\IRabi\IRabi;

    class DashboardInviteTokensController extends DashboardController {
        public const URL = '/admin/tokens/';

        public static function get__main(IGlobalReqParams $globals, IRouterUriParams $params): mixed {
            return ControllerTools::redirect(IRabi::url(DashboardUsersController::URL) . '?tab=tokens');
        }

        public static function post__list(IGlobalReqParams $globals, IRouterUriParams $params): mixed {
            if (!static::isModerator()) {
                return ControllerTools::JSON(['error' => 'Access denied'], status: 403);
            }

            $search = trim((string)$globals->readPostValue('search', ''));
            $status = trim((string)$globals->readPostValue('status', ''));

            $tokens = InviteTokens::get()->selectAll(function (SelectInterface $q) use ($search, $status): void {
                if ($search !== '') {
                    $q->where('label LIKE :search', ['search' => '%' . $search . '%']);
                }
                if ($status === 'active') {
                    $q->where('is_disabled = 0');
                    $q->where('(expires_at IS NULL OR expires_at > :now)', ['now' => time()]);
                    $q->where('uses_left > 0');
                } elseif ($status === 'disabled') {
                    $q->where('is_disabled = 1');
                } elseif ($status === 'expired') {
                    $q->where('expires_at IS NOT NULL AND expires_at <= :now', ['now' => time()]);
                    $q->where('is_disabled = 0');
                } elseif ($status === 'exhausted') {
                    $q->where('uses_left <= 0');
                    $q->where('is_disabled = 0');
                }
                $q->orderBy(['id DESC']);
            });

            // Resolve creator names
            $creatorIds = array_values(array_unique(array_filter(array_map(
                fn ($t) => (int)($t['created_by'] ?? 0),
                $tokens
            ))));
            $creatorNames = [];
            if (!empty($creatorIds)) {
                $accs = DbAccount::get()->selectByIds($creatorIds, function (SelectInterface $q): void {
                    $q->resetCols();
                    $q->cols(['id', 'login', 'name']);
                });
                foreach ($accs as $a) {
                    $creatorNames[(int)$a['id']] = $a['name'] ?: $a['login'];
                }
            }

            // Build base URL for token links
            $baseUrl = AppConfig::get(IniConfig::ENV_APP)->baseUrl();

            $now = time();
            $result = [];
            foreach ($tokens as $t) {
                $isDisabled = (int)($t['is_disabled'] ?? 0) === 1;
                $expiresAt = $t['expires_at'] !== null ? (int)$t['expires_at'] : null;
                $isExpired = $expiresAt !== null && $expiresAt > 0 && $expiresAt < $now;
                $isExhausted = (int)($t['uses_left'] ?? 0) <= 0;

                $tokenStatus = 'active';
                if ($isDisabled) {
                    $tokenStatus = 'disabled';
                } elseif ($isExpired) {
                    $tokenStatus = 'expired';
                } elseif ($isExhausted) {
                    $tokenStatus = 'exhausted';
                }

                $creatorId = (int)($t['created_by'] ?? 0);
                $result[] = [
                    'id' => (int)$t['id'],
                    'token' => $t['token'],
                    'label' => $t['label'],
                    'url' => $baseUrl . IRabi::url('/first-step/token~' . $t['token']),
                    'expires_at' => $expiresAt,
                    'max_uses' => (int)$t['max_uses'],
                    'uses_left' => (int)$t['uses_left'],
                    'used' => (int)$t['max_uses'] - (int)$t['uses_left'],
                    'is_disabled' => $isDisabled,
                    'status' => $tokenStatus,
                    'created_at' => (int)$t['created_at'],
                    'created_by' => $creatorId,
                    'created_by_name' => $creatorNames[$creatorId] ?? null,
                    'account_type' => (string)($t['account_type'] ?? 'user'),
                ];
            }

            return ControllerTools::JSON(['tokens' => $result]);
        }

        public static function post__create(IGlobalReqParams $globals, IRouterUriParams $params): mixed {
            if (!static::isModerator()) {
                return ControllerTools::JSON(['error' => 'Access denied'], status: 403);
            }

            $label = trim((string)$globals->readPostValue('label', ''));
            $maxUses = max(1, (int)$globals->readPostValue('max_uses', '1'));
            $ttl = (int)$globals->readPostValue('ttl', '0'); // seconds, 0 = no expiry
            $accountType = (string)$globals->readPostValue('account_type', 'user');
            if (!in_array($accountType, ['user', 'expert'], true)) {
                return ControllerTools::JSON(['error' => 'Invalid account_type'], status: 400);
            }

            $expiresAt = $ttl > 0 ? time() + $ttl : null;
            $actor = Account::fromSession();
            $createdBy = $actor ? $actor->id() : 0;

            $tokenData = FwInviteTokenService::generate($label, $expiresAt, $maxUses, $createdBy, $accountType);

            EntityHistoryService::record(
                tableClass: EntityHistory::class,
                entityType: 'invite_token',
                entityId:   (int)$tokenData['id'],
                action:     'create',
                diff:       [
                    'label' => ['old' => null, 'new' => $label],
                    'max_uses' => ['old' => null, 'new' => $maxUses],
                    'expires_at' => ['old' => null, 'new' => $expiresAt],
                    'account_type' => ['old' => null, 'new' => $accountType],
                ],
            );

            $baseUrl = AppConfig::get(IniConfig::ENV_APP)->baseUrl();
            $tokenData['url'] = $baseUrl . IRabi::url('/first-step/token~' . $tokenData['token']);
            $tokenData['used'] = 0;
            $tokenData['status'] = 'active';
            $tokenData['created_by_name'] = $actor ? ($actor->readParam('name') ?: $actor->readParam('login')) : null;

            return ControllerTools::JSON(['success' => true, 'token' => $tokenData]);
        }

        public static function post__update(IGlobalReqParams $globals, IRouterUriParams $params): mixed {
            if (!static::isModerator()) {
                return ControllerTools::JSON(['error' => 'Access denied'], status: 403);
            }
            $id = (int)$globals->readPostValue('id', '0');
            if ($id <= 0) {
                return ControllerTools::JSON(['error' => 'Invalid params'], status: 400);
            }

            $token = InviteTokens::get()->selectOneByField('id', $id);
            if (!$token) {
                return ControllerTools::JSON(['error' => 'Token not found'], status: 404);
            }

            $label = trim((string)$globals->readPostValue('label', ''));
            $maxUses = max(1, (int)$globals->readPostValue('max_uses', '1'));
            $expiresAtRaw = $globals->readPostValue('expires_at');

            // Calculate uses_left adjustment: if max_uses changed, adjust uses_left proportionally
            $oldMaxUses = (int)$token['max_uses'];
            $oldUsesLeft = (int)$token['uses_left'];
            $used = $oldMaxUses - $oldUsesLeft;
            $newUsesLeft = max(0, $maxUses - $used);

            $update = [
                'label' => $label,
                'max_uses' => $maxUses,
                'uses_left' => $newUsesLeft,
            ];

            // Handle expires_at: empty/zero means no expiry (NULL).
            // Strings shaped like `YYYY-MM-DDTHH:mm` come from <input type="datetime-local">
            // and are interpreted in the editing moderator's timezone (AGENTS.md §12).
            // Numeric strings are kept for backward compatibility (treated as unix seconds).
            if ($expiresAtRaw === '' || $expiresAtRaw === '0' || $expiresAtRaw === null || $expiresAtRaw === 0) {
                $update['expires_at'] = null;
            } elseif (is_string($expiresAtRaw) && !ctype_digit($expiresAtRaw)) {
                $actor = Account::fromSession();
                $actorTz = $actor?->readParam('time_zone') ?: 'UTC';
                $parsed = DateUtils::parseUserDateTimeLocal($expiresAtRaw, $actorTz);
                if ($parsed <= 0) {
                    return ControllerTools::JSON(['error' => 'Invalid expires_at'], status: 400);
                }
                $update['expires_at'] = $parsed;
            } else {
                $update['expires_at'] = (int)$expiresAtRaw;
            }

            InviteTokens::get()->updateByField($update, 'id', $id);

            $diff = EntityHistoryService::diff(
                $token,
                array_merge($token, $update),
                ignoredFields: ['uses_left'],
            );
            if ($diff !== []) {
                EntityHistoryService::record(
                    tableClass: EntityHistory::class,
                    entityType: 'invite_token',
                    entityId:   $id,
                    action:     'update',
                    diff:       $diff,
                );
            }

            return ControllerTools::JSON(['success' => true, 'expires_at' => $update['expires_at']]);
        }

        public static function post__disable(IGlobalReqParams $globals, IRouterUriParams $params): mixed {
            if (!static::isModerator()) {
                return ControllerTools::JSON(['error' => 'Access denied'], status: 403);
            }
            $id = (int)$globals->readPostValue('id', '0');
            if ($id <= 0) {
                return ControllerTools::JSON(['error' => 'Invalid params'], status: 400);
            }
            InviteTokens::get()->updateByField(['is_disabled' => 1], 'id', $id);
            EntityHistoryService::record(
                tableClass: EntityHistory::class,
                entityType: 'invite_token',
                entityId:   $id,
                action:     'disable',
                diff:       ['is_disabled' => ['old' => 0, 'new' => 1]],
            );
            return ControllerTools::JSON(['success' => true]);
        }

        public static function post__enable(IGlobalReqParams $globals, IRouterUriParams $params): mixed {
            if (!static::isModerator()) {
                return ControllerTools::JSON(['error' => 'Access denied'], status: 403);
            }
            $id = (int)$globals->readPostValue('id', '0');
            if ($id <= 0) {
                return ControllerTools::JSON(['error' => 'Invalid params'], status: 400);
            }
            InviteTokens::get()->updateByField(['is_disabled' => 0], 'id', $id);
            EntityHistoryService::record(
                tableClass: EntityHistory::class,
                entityType: 'invite_token',
                entityId:   $id,
                action:     'enable',
                diff:       ['is_disabled' => ['old' => 1, 'new' => 0]],
            );
            return ControllerTools::JSON(['success' => true]);
        }

        public static function post__delete(IGlobalReqParams $globals, IRouterUriParams $params): mixed {
            if (!static::isModerator()) {
                return ControllerTools::JSON(['error' => 'Access denied'], status: 403);
            }
            $id = (int)$globals->readPostValue('id', '0');
            if ($id <= 0) {
                return ControllerTools::JSON(['error' => 'Invalid params'], status: 400);
            }
            $token = InviteTokens::get()->selectOneByField('id', $id);
            InviteTokens::get()->deleteByField('id', $id);
            EntityHistoryService::record(
                tableClass: EntityHistory::class,
                entityType: 'invite_token',
                entityId:   $id,
                action:     'delete',
                snapshot:   $token ?: null,
            );
            return ControllerTools::JSON(['success' => true]);
        }

        public static function post__registrations(IGlobalReqParams $globals, IRouterUriParams $params): mixed {
            if (!static::isModerator()) {
                return ControllerTools::JSON(['error' => 'Access denied'], status: 403);
            }
            $tokenId = (int)$globals->readPostValue('token_id', '0');
            if ($tokenId <= 0) {
                return ControllerTools::JSON(['error' => 'Invalid params'], status: 400);
            }

            $rows = InviteRegistrations::get()->selectAll(function (SelectInterface $q) use ($tokenId): void {
                $q->where('token_id = :tid', ['tid' => $tokenId]);
                $q->orderBy(['registered_at DESC']);
            });

            // Resolve account names
            $accountIds = array_values(array_unique(array_filter(array_map(
                fn ($r) => (int)($r['account_id'] ?? 0), $rows
            ))));
            $accountNames = [];
            if (!empty($accountIds)) {
                $accs = DbAccount::get()->selectByIds($accountIds, function (SelectInterface $q): void {
                    $q->resetCols();
                    $q->cols(['id', 'login', 'name']);
                });
                foreach ($accs as $a) {
                    $accountNames[(int)$a['id']] = ['name' => $a['name'] ?: $a['login'], 'login' => $a['login']];
                }
            }

            $result = [];
            foreach ($rows as $r) {
                $accId = (int)($r['account_id'] ?? 0);
                $info = $accountNames[$accId] ?? null;
                $result[] = [
                    'id' => (int)$r['id'],
                    'account_id' => $accId,
                    'account_name' => $info['name'] ?? ('#' . $accId),
                    'account_login' => $info['login'] ?? '',
                    'registered_at' => (int)$r['registered_at'],
                    'ip' => $r['ip'],
                    'user_agent' => $r['user_agent'],
                ];
            }

            return ControllerTools::JSON(['registrations' => $result]);
        }
    }
}
