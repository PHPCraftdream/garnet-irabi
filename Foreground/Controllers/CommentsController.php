<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Foreground\Controllers {
    use Aura\SqlQuery\Common\SelectInterface;
    use PHPCraftdream\Garnet\Kernel\Core\FrameworkController;
    use PHPCraftdream\Garnet\Kernel\Db\Entity\Account\Account;
    use PHPCraftdream\Garnet\Kernel\Db\Entity\Account\DbAccount;
    use PHPCraftdream\Garnet\Kernel\Db\Entity\Session\Session;
    use PHPCraftdream\Garnet\Kernel\Interfaces\IGlobalReqParams;
    use PHPCraftdream\Garnet\Kernel\Interfaces\Router\IRouterUriParams;
    use PHPCraftdream\Garnet\Kernel\Io\Router\ControllerTools;
    use PHPCraftdream\IRabi\Common\PaginationHelper;
    use PHPCraftdream\IRabi\Common\Services\AccountDisplay;
    use PHPCraftdream\IRabi\Common\Tables\Comments;
    use PHPCraftdream\IRabi\Foreground\Params\UserEntityConfig;

    class CommentsController extends FrameworkController {
        public const URL = '/comments/';

        public static function post__list(IGlobalReqParams $globals, IRouterUriParams $params): mixed {
            $account = Account::fromSession();
            if (!$account) {
                return ControllerTools::JSON(['error' => 'Not authenticated'], status: 401);
            }

            $entityType = trim((string)$globals->readPostValue('entity_type', ''));
            $entityId = (int)$globals->readPostValue('entity_id', '0');

            if (!in_array($entityType, Comments::VALID_ENTITY_TYPES, true) || !$entityId) {
                return ControllerTools::JSON(['error' => 'Invalid params'], status: 400);
            }

            ['page' => $page, 'perPage' => $perPage] = PaginationHelper::readPageParams($globals);

            // Moderators see hidden comments (with status flag in payload),
            // regular users never see them.
            $isModerator = UserEntityConfig::isModerator();

            $queryCallback = function (SelectInterface $q) use ($entityType, $entityId, $isModerator): void {
                $q->where('entity_type = ? AND entity_id = ?', [$entityType, $entityId]);
                if (!$isModerator) {
                    $q->where('is_hidden = ?', [0]);
                }
                $q->orderBy(['created_at DESC']);
            };

            $pageData = PaginationHelper::fetchPage(Comments::get(), $page, $perPage, $queryCallback);

            // Enrich with author names
            $comments = $pageData->pageItems;
            $authorIds = array_unique(array_filter(array_column($comments, 'author_id')));
            $authors = [];
            if (!empty($authorIds)) {
                $accs = DbAccount::get()->selectByField('id', array_map('intval', $authorIds));
                foreach ($accs as $a) {
                    $authors[(int)$a['id']] = $a;
                }
            }

            $disabledAuthorIds = AccountDisplay::disabledIds(array_keys($authors));
            foreach ($comments as &$comment) {
                $aid = (int)$comment['author_id'];
                if (isset($disabledAuthorIds[$aid])) {
                    $comment['author_name'] = AccountDisplay::disabledName($aid);
                } else {
                    $comment['author_name'] = $authors[$aid]['name'] ?? '';
                }
                $comment['author_login'] = '';
            }
            unset($comment);

            $pageData->pageItems = array_values($comments);

            return ControllerTools::JSON(PaginationHelper::toPageResponse($pageData));
        }

        public static function post__create(IGlobalReqParams $globals, IRouterUriParams $params): mixed {
            $account = Account::fromSession();
            if (!$account) {
                return ControllerTools::JSON(['error' => 'Not authenticated'], status: 401);
            }

            $postCsrf = $globals->readPostValue(Session::CSRF_TOKEN, '');
            if (!hash_equals(Session::touchCSRF_(), (string)$postCsrf)) {
                return ControllerTools::JSON(['error' => 'CSRF check failed'], status: 403);
            }

            $accountId = $account->id();
            $entityType = trim((string)$globals->readPostValue('entity_type', ''));
            $entityId = (int)$globals->readPostValue('entity_id', '0');
            $body = trim((string)$globals->readPostValue('body', ''));

            if (!in_array($entityType, Comments::VALID_ENTITY_TYPES, true)) {
                return ControllerTools::JSON(['error' => 'Invalid entity type'], status: 400);
            }

            if (!$entityId || $body === '') {
                return ControllerTools::JSON(['error' => 'Invalid params'], status: 400);
            }

            if (mb_strlen($body) > 4000) {
                return ControllerTools::JSON(['error' => 'Comment too long (max 4000 chars)'], status: 400);
            }

            if ($entityId === $accountId) {
                return ControllerTools::JSON(['error' => 'Cannot comment on your own profile'], status: 400);
            }

            // Validate entity is a currently-public expert (only expert type
            // supported now). Security audit L-01: a bare expert_profiles row
            // doesn't reflect account-level demotion/disable/unapproval — a
            // comment target must pass the same predicate the public expert
            // profile itself requires.
            if (!UserEntityConfig::isApprovedActiveExpert($entityId)) {
                return ControllerTools::JSON(['error' => 'Entity not found'], status: 404);
            }

            $now = time();

            $commentId = Comments::get()->insert([
                'author_id' => $accountId,
                'entity_type' => $entityType,
                'entity_id' => $entityId,
                'body' => $body,
                'created_at' => $now,
            ]);

            $comment = Comments::get()->selectOneByField('id', $commentId);
            $comment['author_name'] = $account->readParam('name') ?? '';
            $comment['author_login'] = '';

            return ControllerTools::JSON([
                'success' => true,
                'comment' => $comment,
            ]);
        }

        public static function post__delete(IGlobalReqParams $globals, IRouterUriParams $params): mixed {
            $account = Account::fromSession();
            if (!$account) {
                return ControllerTools::JSON(['error' => 'Not authenticated'], status: 401);
            }

            $postCsrf = $globals->readPostValue(Session::CSRF_TOKEN, '');
            if (!hash_equals(Session::touchCSRF_(), (string)$postCsrf)) {
                return ControllerTools::JSON(['error' => 'CSRF check failed'], status: 403);
            }

            $accountId = $account->id();
            $commentId = (int)$globals->readPostValue('id', '0');

            if (!$commentId) {
                return ControllerTools::JSON(['error' => 'Invalid params'], status: 400);
            }

            $comment = Comments::get()->selectOneByField('id', $commentId);
            if (!$comment) {
                return ControllerTools::JSON(['error' => 'Comment not found'], status: 404);
            }

            // Only author or moderator+ can delete
            $isAuthor = (int)$comment['author_id'] === $accountId;
            $isModerator = UserEntityConfig::isModerator();

            if (!$isAuthor && !$isModerator) {
                return ControllerTools::JSON(['error' => 'Access denied'], status: 403);
            }

            Comments::get()->deleteByField('id', $commentId);

            return ControllerTools::JSON(['success' => true]);
        }
    }
}
