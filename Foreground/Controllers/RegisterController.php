<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Foreground\Controllers {
    use PHPCraftdream\Garnet\Bundle\Modules\Invite\FwInviteTokenService;
    use PHPCraftdream\Garnet\Bundle\Modules\SystemSettings\FwAppSettings;
    use PHPCraftdream\Garnet\Bundle\Utils\HtmlLayout;
    use PHPCraftdream\Garnet\Bundle\Utils\RenderIsland;
    use PHPCraftdream\Garnet\Kernel\Core\FrameworkController;
    use PHPCraftdream\Garnet\Kernel\Db\Entity\Account\Account;
    use PHPCraftdream\Garnet\Kernel\Interfaces\IGlobalReqParams;
    use PHPCraftdream\Garnet\Kernel\Interfaces\Router\IRouterUriParams;
    use PHPCraftdream\Garnet\Kernel\Io\Router\ControllerTools;
    use PHPCraftdream\Garnet\Kernel\Io\Twig\TwigParams;
    use PHPCraftdream\IRabi\Foreground\I18n\ForegroundI18n;
    use PHPCraftdream\IRabi\Foreground\Middlewares\IrabiAuthMiddleware;
    use PHPCraftdream\IRabi\Foreground\Middlewares\UserDataMiddleware;
    use PHPCraftdream\IRabi\IRabi;

    class RegisterController extends FrameworkController {
        public const URL = '/first-step';

        private static function renderError(string $reason): mixed {
            $t = ForegroundI18n::getInstance();
            $supportContacts = FwAppSettings::supportContacts();

            $reasonLabels = [
                'unknown' => $t->Invite_Error_Unknown(),
                'expired' => $t->Invite_Error_Expired(),
                'exhausted' => $t->Invite_Error_Exhausted(),
                'disabled' => $t->Invite_Error_Disabled(),
            ];

            $content = RenderIsland::render('invite-error', [
                'reason' => $reasonLabels[$reason] ?? $reasonLabels['unknown'],
                'title' => $t->Invite_Error_Title(),
                'contactMessage' => $t->Invite_Error_ContactSupport(),
                'supportContacts' => $supportContacts,
            ]);

            return ControllerTools::ok(HtmlLayout::render(
                TwigParams::init()->get(TwigParams::DEF_LAYOUT_PARAMS, [
                    'top_menu_items' => [],
                    'side_menu_items' => [],
                    'content' => $content,
                ])
            ));
        }

        public static function get__main(IGlobalReqParams $globals, IRouterUriParams $params): mixed {
            $tokenString = (string)$params->getUriParam('token');
            $validation = FwInviteTokenService::validate($tokenString);

            if (!$validation['valid']) {
                return static::renderError($validation['reason']);
            }

            // Already logged in -> redirect to home
            IrabiAuthMiddleware::$customTitle = ForegroundI18n::t('Invite_FirstStep_Title');
            $response = IrabiAuthMiddleware::authOnly($globals, $params);
            IrabiAuthMiddleware::$customTitle = null;
            if ($response === null) {
                return ControllerTools::redirect(IRabi::url('/'));
            }
            return $response;
        }

        public static function post__main(IGlobalReqParams $globals, IRouterUriParams $params): mixed {
            $tokenString = (string)$params->getUriParam('token');
            $validation = FwInviteTokenService::validate($tokenString);

            if (!$validation['valid']) {
                if ($globals->isPost()) {
                    return ControllerTools::JSON([
                        'error' => ForegroundI18n::t('Invite_Error_Title'),
                    ], status: 403);
                }
                return static::renderError($validation['reason']);
            }

            IrabiAuthMiddleware::$customTitle = ForegroundI18n::t('Invite_FirstStep_Title');
            $response = IrabiAuthMiddleware::authOnly($globals, $params);
            IrabiAuthMiddleware::$customTitle = null;
            if ($response !== null) {
                // The auth middleware just authenticated the user (e.g. .test
                // dev auto-login or a successful code-verify). Pin the account
                // type carried by this invite token NOW, while we still have
                // access to the token row — the actual profile submission
                // (action=reg_user) will be POSTed against MainController
                // after the auth response navigates away from /first-step,
                // so this is our only chance to apply the invite's type.
                $tokenRow = $validation['token'];
                $tokenType = (string)($tokenRow['account_type'] ?? 'user');
                if (!in_array($tokenType, ['user', 'expert'], true)) {
                    $tokenType = 'user';
                }
                $account = Account::fromSession();
                if ($account && $account->id() && empty($account->readParam('type'))) {
                    $account->setParam('type', $tokenType);
                    $account->flush();
                    $account->readDataAsyncPollFinishAll();
                }
                return $response;
            }

            // Authenticated -- handle profile form submission
            if ($globals->readPostValue('action') === 'reg_user') {
                $account = Account::fromSession();
                if (!$account || !$account->id()) {
                    return ControllerTools::JSON(['error' => 'Not authenticated'], status: 401);
                }

                // Atomically consume the invite BEFORE saving any profile data
                // (security audit M-01): FwInviteTokenService::consume() is a
                // CAS decrement that only succeeds while uses_left > 0. If two
                // clients race on the same limited-use token, the loser must
                // be rejected here — not silently let through after the
                // consume() return value was previously ignored, which let
                // registrations exceed the token's uses_left.
                $tokenRow = $validation['token'];
                $consumed = FwInviteTokenService::consume(
                    (int)$tokenRow['id'],
                    $account->id(),
                    (string)$globals->ip(),
                    (string)($globals->readServerValue('HTTP_USER_AGENT', '') ?? '')
                );
                if (!$consumed) {
                    return ControllerTools::JSON([
                        'error' => ForegroundI18n::t('Invite_Error_Title'),
                    ], status: 409);
                }

                $result = UserDataMiddleware::processPost($globals);

                // If the user did not opt into mailings at registration, start
                // their profile with every email-notification category off.
                $marketingConsent = (string)$globals->readPostValue('consent_marketing', '') === '1'
                    || !empty($account->readParam('consent_marketing_at'));
                if (!$marketingConsent) {
                    $account->setData('email_notif_prefs', json_encode([
                        'messages' => 'off',
                        'support' => 'off',
                        'bookings' => 'off',
                    ], JSON_UNESCAPED_UNICODE));
                    $account->flush();
                    $account->readDataAsyncPollFinishAll();
                }

                return $result;
            }

            return ControllerTools::redirect(IRabi::url('/'));
        }
    }
}
