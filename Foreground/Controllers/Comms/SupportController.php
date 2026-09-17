<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Foreground\Controllers\Comms {
    use PHPCraftdream\Garnet\Bundle\Modules\Comms\Support\Controllers\FwSupportController;
    use PHPCraftdream\Garnet\Kernel\Db\Entity\Account\Account;
    use PHPCraftdream\Garnet\Kernel\Db\Tables\DbTable;
    use PHPCraftdream\Garnet\Kernel\Interfaces\Core\IGlobalReqParams;
    use PHPCraftdream\Garnet\Kernel\Interfaces\Web\Router\IRouterUriParams;
    use PHPCraftdream\Garnet\Kernel\Io\Http\Router\Controller\ControllerTools;
    use PHPCraftdream\IRabi\Common\Services\Comms\EmailNotifications;
    use PHPCraftdream\IRabi\Common\Services\Comms\SupportResponseEta;
    use PHPCraftdream\IRabi\Common\Tables\Support\SupportAttachments;
    use PHPCraftdream\IRabi\Common\Tables\Support\SupportMessages;
    use PHPCraftdream\IRabi\Common\Tables\Support\SupportTickets;
    use PHPCraftdream\IRabi\Foreground\Params\Menu;
    use PHPCraftdream\IRabi\IRabi;

    class SupportController extends FwSupportController {
        public const URL = '/support/';

        protected static function getUploadDir(): string {
            return IRabi::getInstance()->uploadDir;
        }

        protected static function getSideMenu(string $url): array {
            return Menu::side($url);
        }

        protected static function getMainMenu(string $url): array {
            return Menu::main($url);
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

        public static function get__main(IGlobalReqParams $globals, IRouterUriParams $params): mixed {
            return parent::get__main($globals, $params);
        }

        public static function post__createTicket(IGlobalReqParams $globals, IRouterUriParams $params): mixed {
            $result = parent::post__createTicket($globals, $params);

            if ($result->getStatusCode() === 200) {
                $account = Account::fromSession();
                $subject = trim((string)$globals->readPostValue('subject', ''));
                $ticket = static::ticketsTable()->selectOneByField('account_id', $account->id(), function ($q): void {
                    $q->orderBy(['id DESC']);
                    $q->limit(1);
                });
                if ($ticket) {
                    // Имя человека — колонка `accounts.name`, а не запись в
                    // EAV-таблице `accounts_data` (там такого ключа не бывает
                    // ни у кого — тот же разбор, что в D-391 для другого места).
                    $userName = $account->readParam('name') ?: ('#' . $account->id());
                    EmailNotifications::supportTicketCreated((int)$ticket['id'], $subject, $userName);

                    // D-211: в момент отправки экран молчал — ни номера
                    // обращения, ни ориентира по времени ответа. Медиана
                    // считается по факту (последние обращения с реальным
                    // первым ответом), а не написана руками в шаблоне —
                    // соврёт первой же, когда тайминги поддержки изменятся.
                    $body = json_decode((string)$result->getBody(), true) ?: [];
                    $body['ticketId'] = (int)$ticket['id'];
                    $body['responseEtaMinutes'] = SupportResponseEta::medianFirstResponseMinutes();
                    $result = ControllerTools::JSON($body);
                }
            }

            return $result;
        }

        public static function post__reply(IGlobalReqParams $globals, IRouterUriParams $params): mixed {
            $result = parent::post__reply($globals, $params);

            if ($result->getStatusCode() === 200) {
                $account = Account::fromSession();
                $ticketId = (int)$globals->readPostValue('ticket_id', '0');
                if ($ticketId > 0) {
                    $ticket = static::ticketsTable()->selectOneByField('id', $ticketId);
                    if ($ticket) {
                        $userName = $account->readParam('name') ?: ('#' . $account->id());
                        EmailNotifications::supportUserReply($ticketId, $ticket['subject'] ?? '', $userName);
                    }
                }
            }

            return $result;
        }
    }
}
