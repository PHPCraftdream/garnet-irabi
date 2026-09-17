<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Foreground\Controllers {
    use Aura\SqlQuery\Common\SelectInterface;
    use PHPCraftdream\Garnet\Kernel\Core\Runtime\FrameworkController;
    use PHPCraftdream\Garnet\Kernel\Db\Entity\Account\Account;
    use PHPCraftdream\Garnet\Kernel\Db\Entity\Session\Session;
    use PHPCraftdream\Garnet\Kernel\Interfaces\Core\IGlobalReqParams;
    use PHPCraftdream\Garnet\Kernel\Interfaces\Web\Router\IRouterUriParams;
    use PHPCraftdream\Garnet\Kernel\Io\Http\Router\Controller\ControllerTools;
    use PHPCraftdream\IRabi\Common\PaginationHelper;
    use PHPCraftdream\IRabi\Common\Services\ExpertDirectory;
    use PHPCraftdream\IRabi\Common\Tables\Bookings;
    use PHPCraftdream\IRabi\Common\Tables\Comments;
    use PHPCraftdream\IRabi\Foreground\Params\UserEntityConfig;

    class CommentsController extends FrameworkController {
        public const URL = '/comments/';

        /**
         * D-128: reviews existed nowhere outside the expert page they were
         * written on — an author with reviews for three different experts had
         * no single place to see any of them, count how many they'd written,
         * or find one again. Scoped to `author_id = $accountId` server-side,
         * so unlike post__list this never takes entity_type/entity_id from
         * the client — there is nothing to authorize per-row, the query
         * itself can only ever return the caller's own comments.
         */
        public static function post__myList(IGlobalReqParams $globals, IRouterUriParams $params): mixed {
            $account = Account::fromSession();
            if (!$account) {
                return ControllerTools::JSON(['error' => 'Not authenticated'], status: 401);
            }

            $accountId = $account->id();
            ['page' => $page, 'perPage' => $perPage] = PaginationHelper::readPageParams($globals);

            $pageData = PaginationHelper::fetchPage(
                Comments::get(),
                $page,
                $perPage,
                static function (SelectInterface $q) use ($accountId): void {
                    $q->where('author_id = ?', [$accountId]);
                    $q->orderBy(['created_at DESC']);
                },
            );

            $expertIds = array_unique(array_column($pageData->pageItems, 'entity_id'));
            $experts = ExpertDirectory::byIds($expertIds);

            $items = [];
            foreach ($pageData->pageItems as $c) {
                $expertId = (int)$c['entity_id'];
                $items[] = [
                    'id' => (int)$c['id'],
                    'expert_id' => $expertId,
                    'expert_name' => $experts[$expertId]['display_name'] ?? '',
                    'body' => (string)$c['body'],
                    'moderation_status' => $c['moderation_status'],
                    'created_at' => (int)$c['created_at'],
                ];
            }
            $pageData->pageItems = $items;

            return ControllerTools::JSON(PaginationHelper::toPageResponse($pageData));
        }

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
            $accountId = $account->id();

            // Обычный посетитель видит одобренные отзывы — и свой собственный
            // в любом состоянии. Без этого исключения автор, отправив отзыв,
            // не находит его на странице и делает единственный доступный ему
            // вывод: отправка не сработала. Тот же класс, что D-039 и D-041,
            // только молчание здесь не в ошибке, а в исчезновении написанного.
            $queryCallback = function (SelectInterface $q) use ($entityType, $entityId, $isModerator, $accountId): void {
                $q->where('entity_type = ? AND entity_id = ?', [$entityType, $entityId]);

                if (!$isModerator) {
                    if ($accountId > 0) {
                        $q->where(
                            '((is_hidden = ? AND moderation_status = ?) OR author_id = ?)',
                            [0, Comments::STATUS_APPROVED, $accountId]
                        );
                    } else {
                        $q->where('is_hidden = ? AND moderation_status = ?', [0, Comments::STATUS_APPROVED]);
                    }
                }

                $q->orderBy(['created_at DESC']);
            };

            $pageData = PaginationHelper::fetchPage(Comments::get(), $page, $perPage, $queryCallback);

            // Имена авторов здесь больше не поднимаются вовсе.
            //
            // Раньше их выбирали из базы, чтобы показать модератору. Теперь имя
            // не уходит никому, и запроса за ним быть не должно: данные, которые
            // некому показать, незачем и доставать. Заодно исчезает соблазн
            // «показать хотя бы модератору» при следующей правке.
            $comments = $pageData->pageItems;

            foreach ($comments as &$comment) {
                $aid = (int)$comment['author_id'];
                $comment['is_mine'] = $aid === $accountId;

                // Имя автора не уходит НИКОМУ, включая модератора.
                //
                // Раньше оно уходило модератору — с обоснованием, что решение
                // принимает человек и отвечает за него. Владелец решил иначе, и
                // это сильнее: модератор судит текст, а не человека, а имя
                // раскрывается только владельцу платформы и только по отдельному
                // ходу — когда модератор пометил отзыв как опасный
                // (`Comments::STATUS_FLAGGED`). Тот, кто вскрывает анонимность,
                // отвечает за это своим положением.
                //
                // Автор своё имя тоже не получает обратно: пусть видит свой отзыв
                // ровно таким, каким его увидят другие. Иначе обещание
                // анонимности проверить нечем.
                $comment['author_name'] = '';
                $comment['author_id'] = 0;
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

            // Отзыв можно оставить только действующему преподавателю. Аудит
            // L-01: когда-то достаточно было строки в отдельной таблице
            // профилей, а она не знала ни о разжаловании, ни об отключении.
            // Условие здесь — то же, что и на самой публичной карточке.
            if (!UserEntityConfig::isApprovedActiveExpert($entityId)) {
                return ControllerTools::JSON(['error' => 'Entity not found'], status: 404);
            }

            // D-173: отзыв можно было оставить, ни разу не занимавшись у
            // эксперта, — и любое число раз подряд. Отзыв — о состоявшемся
            // занятии, право писать его наступает только после него.
            if (!Bookings::hasCompletedBookingWith($accountId, $entityId)) {
                return ControllerTools::JSON(['error' => 'No completed booking with this expert'], status: 403);
            }

            $now = time();

            // Отзыв не публикуется сразу: сначала его читает модератор.
            // Состояние проставляется явно, а не полагается на DEFAULT
            // колонки — из кода должно быть видно, что происходит с тем, что
            // человек только что написал.
            $commentId = Comments::get()->insert([
                'author_id' => $accountId,
                'entity_type' => $entityType,
                'entity_id' => $entityId,
                'body' => $body,
                'created_at' => $now,
                'moderation_status' => Comments::STATUS_PENDING,
            ]);

            // Ответ отдаётся в том же виде, в каком отзыв увидят другие:
            // без имени. Автор узнаёт свой по `is_mine`.
            $comment = Comments::get()->selectOneByField('id', $commentId);
            $comment['author_id'] = 0;
            $comment['author_name'] = '';
            $comment['author_login'] = '';
            $comment['is_mine'] = true;

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
