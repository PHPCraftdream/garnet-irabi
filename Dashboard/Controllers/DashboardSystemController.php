<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Dashboard\Controllers {
    use PHPCraftdream\Garnet\Bundle\Modules\EntityHistory\SystemSettingsHistory;
    use PHPCraftdream\Garnet\Bundle\Modules\SystemSettings\Controllers\FwSystemSettingsController;
    use PHPCraftdream\Garnet\Bundle\Modules\SystemSettings\FwAppSettings;
    use PHPCraftdream\Garnet\Bundle\Utils\HtmlLayout;
    use PHPCraftdream\Garnet\Bundle\Utils\RenderIsland;
    use PHPCraftdream\Garnet\Bundle\Utils\Upload\PublicImageUploadTrait;
    use PHPCraftdream\Garnet\Kernel\Db\Entity\Account\Account;
    use PHPCraftdream\Garnet\Kernel\Interfaces\IGlobalReqParams;
    use PHPCraftdream\Garnet\Kernel\Interfaces\Router\IRouterUriParams;
    use PHPCraftdream\Garnet\Kernel\Io\Mailer\Mailer;
    use PHPCraftdream\Garnet\Kernel\Io\Router\ControllerTools;
    use PHPCraftdream\Garnet\Kernel\Io\Twig\TwigParams;
    use PHPCraftdream\IRabi\Common\Services\EmailNotifications;
    use PHPCraftdream\IRabi\Common\System\AppSettings;
    use PHPCraftdream\IRabi\Common\Tables\EntityHistory;
    use PHPCraftdream\IRabi\Dashboard\IrabiDashboardMenuTrait;
    use PHPCraftdream\IRabi\Foreground\I18n\ForegroundI18n;
    use PHPCraftdream\IRabi\Foreground\Params\UserEntityConfig;
    use PHPCraftdream\IRabi\IRabi;
    use Throwable;

    class DashboardSystemController extends FwSystemSettingsController {
        use IrabiDashboardMenuTrait;
        // OG / social preview image upload (post__uploadImage / post__deleteImage).
        use PublicImageUploadTrait;

        public const URL = '/admin/system/';

        protected static function isAllowed(): bool {
            return UserEntityConfig::isOwner();
        }

        protected static function uploadDir(): string {
            return IRabi::getInstance()->publicUploadDir . 'seo' . DIRECTORY_SEPARATOR;
        }

        protected static function uploadWebPath(): string {
            return IRabi::getInstance()->publicUploadWebPath . 'seo/';
        }

        protected static function settingsManager(): FwAppSettings {
            return new AppSettings();
        }

        protected static function baseUrl(): string {
            return static::URL;
        }

        protected static function getLabels(): array {
            $t = ForegroundI18n::getInstance();

            return [
                'title' => $t->Admin_SystemSettings(),
                'subtitle' => $t->Admin_SystemSettings_Description(),
                'registrationTitle' => $t->Admin_RegistrationSettings(),
                'registrationTab' => $t->Admin_RegistrationSettings(),
                'registrationEnabled' => $t->Admin_RegistrationEnabled(),
                'registrationHint' => $t->Admin_RegistrationEnabled_Hint(),
                'cancellationPenaltyTab' => $t->Admin_CancellationPenalty_Tab(),
                'cancellationPenaltyTitle' => $t->Admin_CancellationPenalty_Title(),
                'cancellationPenaltyLabel' => $t->Settings_CancellationPenaltyPercent(),
                'cancellationPenaltyHint' => $t->Settings_CancellationPenaltyHelp(),
                'cancellationPenaltyInvalid' => $t->Admin_CancellationPenalty_Invalid(),
                'smtpTitle' => $t->Admin_SMTPSettings(),
                'smtpTab' => $t->Admin_SMTPSettings(),
                'smtpHint' => $t->Admin_SMTPSettings_Hint(),
                'smtpEnabled' => $t->Admin_SMTPEnabled(),
                'smtpEnabledHint' => $t->Admin_SMTPEnabled_Hint(),
                'smtpVerifyPeer' => $t->Admin_SMTPVerifyPeer(),
                'smtpScheme' => $t->Admin_SMTPScheme(),
                'smtpHost' => $t->Admin_SMTPHost(),
                'smtpPort' => $t->Admin_SMTPPort(),
                'smtpUser' => $t->Admin_SMTPUser(),
                'smtpPassword' => $t->Admin_SMTPPassword(),
                'smtpFrom' => $t->Admin_SMTPFrom(),
                'save' => $t->Admin_SaveSettings(),
                'saving' => $t->Admin_SaveSettings_Saving(),
                'saved' => $t->Admin_SaveSettings_Success(),
                'testEmailTitle' => $t->Admin_SystemSettings_TestEmail_Title(),
                'testEmailHint' => $t->Admin_SystemSettings_TestEmail_Hint(),
                'testEmailLabel' => $t->Admin_SystemSettings_TestEmail_Address(),
                'testEmailPlaceholder' => $t->Admin_SystemSettings_TestEmail_Placeholder(),
                'testEmailSend' => $t->Admin_SystemSettings_TestEmail_Send(),
                'testEmailSending' => $t->Admin_SystemSettings_TestEmail_Sending(),
                'testEmailSuccess' => $t->Admin_SystemSettings_TestEmail_Success(),
                'accessDenied' => $t->Admin_SystemSettings_AccessDenied(),
                'error' => $t->General_Error(),
                'invalidEmail' => $t->Admin_SystemSettings_TestEmail_InvalidAddress(),
                'sendFailed' => $t->Admin_SystemSettings_TestEmail_SendFailed(),
                'invalidPort' => $t->Admin_SystemSettings_InvalidPort(),
                'requiredHost' => $t->Admin_SystemSettings_MissingSmtpField(),
                'requiredFrom' => $t->Admin_SystemSettings_MissingSmtpField(),
                'testEmailType' => $t->Admin_SystemSettings_TestEmail_Type(),
                'testEmailTypeGeneric' => $t->Admin_SystemSettings_TestEmail_Type_Generic(),
                'supportContactsTab' => $t->Admin_SupportContacts_Tab(),
                'supportContactsTitle' => $t->Admin_SupportContacts_Title(),
                'supportContactsHint' => $t->Admin_SupportContacts_Hint(),
                'supportContactEmail' => $t->Admin_SupportContact_Email(),
                'supportContactPhone' => $t->Admin_SupportContact_Phone(),
                'supportContactTelegram' => $t->Admin_SupportContact_Telegram(),
                'seoTab' => 'SEO / Соцсети',
                'seoTitle' => 'SEO / Соцсети',
                'seoHint' => 'Глобальные настройки по умолчанию для мета-тегов и превью ссылок.',
                'seoDescription' => 'Описание по умолчанию',
                'seoDescriptionHint' => 'используется в превью ссылок, ~160 символов',
                'seoOgImage' => 'OG-изображение по умолчанию',
                'seoOgImageHint' => 'картинка для превью в Telegram/WhatsApp; если пусто — берётся иконка сайта',
                'seoOgImageUpload' => 'Перетащите изображение или нажмите для загрузки',
                'seoOgImageRemove' => 'Удалить изображение',
                'seoOgImageRemoveConfirm' => 'Удалить загруженное изображение?',
                'seoTwitterSite' => 'Twitter / X аккаунт',
                'seoTwitterSitePlaceholder' => '@irabi',
                'historyTab' => $t->Admin_SystemSettings_History_Tab(),
                'historyTitle' => $t->Admin_SystemSettings_History_Title(),
                'historyHint' => $t->Admin_SystemSettings_History_Hint(),
                'historyEmpty' => $t->Admin_SystemSettings_History_Empty(),
                'historyLoading' => $t->Admin_SystemSettings_History_Loading(),
                'historyRefresh' => $t->Admin_SystemSettings_History_Refresh(),
                // OPcache reset — owner-only utility; inline labels avoid a
                // dedicated i18n round-trip just for an ops button.
                'opcacheResetTitle' => 'OPcache',
                'opcacheResetHint' => 'Сбросить байт-код PHP в FPM после деплоя — пригождается на shared-хостинге, где нет sudo для перезапуска php-fpm.',
                'opcacheResetBtn' => 'Сбросить OPcache',
                'opcacheResetSuccess' => 'OPcache сброшен',
                'opcacheResetUnavailable' => 'OPcache недоступен в этом SAPI',
            ];
        }

        public static function get__main(IGlobalReqParams $globals, IRouterUriParams $params): mixed {
            if (!static::isAllowed()) {
                return ControllerTools::redirect(IRabi::url('/'));
            }

            $url = $globals->getUri();
            $baseUrl = IRabi::url(static::baseUrl());
            $content = RenderIsland::render(static::islandName(), [
                'settings' => static::currentSettings(),
                'saveUrl' => $baseUrl . '~save',
                'testEmailUrl' => $baseUrl . '~sendTestEmail',
                'historyListUrl' => $baseUrl . '~historyList',
                'uploadImageUrl' => $baseUrl . '~uploadImage',
                'deleteImageUrl' => $baseUrl . '~deleteImage',
                'opcacheResetUrl' => $baseUrl . '~opcacheReset',
                'labels' => static::getLabels(),
                'mailTypes' => EmailNotifications::listTypesForUi(),
            ]);

            return ControllerTools::ok(HtmlLayout::render(
                TwigParams::init()->get(TwigParams::DEF_LAYOUT_PARAMS, [
                    'content' => $content,
                    'top_menu_items' => static::getMainMenu($url),
                    'side_menu_items' => static::getSideMenu($url),
                ])
            ));
        }

        public static function post__sendTestEmail(IGlobalReqParams $globals, IRouterUriParams $params): mixed {
            if (!static::isAllowed()) {
                return ControllerTools::JSON(['error' => static::getLabels()['accessDenied']], status: 403);
            }

            $labels = static::getLabels();
            $testEmail = trim((string)$globals->readPostValue('test_email', ''));
            if ($testEmail === '' || !filter_var($testEmail, FILTER_VALIDATE_EMAIL)) {
                return ControllerTools::JSON(['error' => $labels['invalidEmail']], status: 400);
            }

            $mailType = trim((string)$globals->readPostValue('mail_type', ''));

            $manager = static::settingsManager();
            $registrationsEnabled = $manager::registrationsEnabled();
            $currentSmtp = $manager::smtpSettings();
            $currentSupportContacts = $manager::supportContacts();
            $smtp = static::smtpFromRequest($globals);
            $saveResult = $manager::save($registrationsEnabled, $smtp);

            if (!empty($saveResult['error'])) {
                return ControllerTools::JSON([
                    'error' => static::saveErrorMessage($saveResult['error']),
                ], status: 400);
            }

            try {
                Mailer::reset();

                if ($mailType !== '' && EmailNotifications::isKnownTestType($mailType)) {
                    $admin = Account::fromSession();
                    $recipientId = $admin?->id() ?? 0;
                    $rendered = EmailNotifications::renderForTest($mailType, $recipientId);

                    $prefix = ForegroundI18n::t('Admin_SystemSettings_TestEmail_TestPrefix');
                    Mailer::get()->sendHtmlMail(
                        $testEmail,
                        $prefix . $rendered['subject'],
                        $rendered['body']
                    );
                } else {
                    Mailer::get()->sendHtmlMail(
                        $testEmail,
                        static::testEmailSubject(),
                        '<p>' . htmlspecialchars(static::testEmailBody()) . '</p>'
                    );
                }
            } catch (Throwable $e) {
                $detail = $e->getMessage();
                $errorText = $labels['sendFailed'] . ($detail ? ': ' . $detail : '');
                return ControllerTools::JSON(['error' => $errorText], status: 400);
            } finally {
                $manager::save($registrationsEnabled, $currentSmtp, null, $currentSupportContacts);
                Mailer::reset();
            }

            return ControllerTools::JSON([
                'success' => true,
                'message' => $labels['testEmailSuccess'],
            ]);
        }

        protected static function testEmailSubject(): string {
            return ForegroundI18n::t('Admin_SystemSettings_TestEmail_Subject');
        }

        protected static function testEmailBody(): string {
            return ForegroundI18n::t('Admin_SystemSettings_TestEmail_Body');
        }

        protected static function saveErrorMessage(string $errorCode): string {
            if ($errorCode === 'invalid_penalty_percent') {
                return ForegroundI18n::t('Admin_CancellationPenalty_Invalid');
            }

            return parent::saveErrorMessage($errorCode);
        }

        public static function post__save(IGlobalReqParams $globals, IRouterUriParams $params): mixed {
            if (!static::isAllowed()) {
                return ControllerTools::JSON(['error' => static::getLabels()['accessDenied']], status: 403);
            }

            $manager = static::settingsManager();
            $smtp = static::smtpFromRequest($globals);

            $penalty = null;
            $penaltyRaw = $globals->readPostValue('cancellation_penalty_percent');
            if ($penaltyRaw !== null && $penaltyRaw !== '') {
                $penalty = (int)$penaltyRaw;
                if ($penalty < 0 || $penalty > 100) {
                    return ControllerTools::JSON([
                        'error' => static::saveErrorMessage('invalid_penalty_percent'),
                    ], status: 400);
                }
            }

            $supportContacts = [
                'email' => trim((string)$globals->readPostValue('support_contact_email', '')),
                'phone' => trim((string)$globals->readPostValue('support_contact_phone', '')),
                'telegram' => trim((string)$globals->readPostValue('support_contact_telegram', '')),
            ];

            $seo = [
                'description' => trim((string)$globals->readPostValue('seo_description', '')),
                'ogImage' => trim((string)$globals->readPostValue('seo_og_image', '')),
                'twitterSite' => trim((string)$globals->readPostValue('seo_twitter_site', '')),
            ];

            $beforeSettings = static::currentSettings();

            $saveResult = $manager::save(
                (int)$globals->readPostValue('registrations_enabled', '0') > 0,
                $smtp,
                $penalty,
                $supportContacts,
                $seo
            );

            if (!empty($saveResult['error'])) {
                return ControllerTools::JSON([
                    'error' => static::saveErrorMessage($saveResult['error']),
                ], status: 400);
            }

            $afterSettings = $saveResult['settings'] ?? static::currentSettings();

            SystemSettingsHistory::recordIfChanged(
                tableClass: EntityHistory::class,
                before:     $beforeSettings,
                after:      $afterSettings,
            );

            return ControllerTools::JSON([
                'success' => true,
                'settings' => $afterSettings,
            ]);
        }

        /**
         * Returns the recent system-settings audit log for the "История"
         * tab in the System Settings page.
         */
        public static function post__historyList(IGlobalReqParams $globals, IRouterUriParams $params): mixed {
            if (!static::isAllowed()) {
                return ControllerTools::JSON(['error' => static::getLabels()['accessDenied']], status: 403);
            }
            $limit = max(1, min(500, (int)$globals->readPostValue('limit', '100')));
            $rows = SystemSettingsHistory::recent(EntityHistory::class, $limit);
            return ControllerTools::JSON([
                'success' => true,
                'rows' => $rows,
            ]);
        }

        /**
         * Drop the FPM OPcache from inside an HTTP request. `php garnet cache`
         * resets the CLI-side cache only — the FPM worker pool keeps its own
         * compiled bytecode and only reloads on SIGUSR2 / pool restart. After a
         * deploy that didn't rebuild the FPM workers, this endpoint is the safe
         * shared-hosting equivalent of `service php-fpm reload`.
         *
         * Owner-only and idempotent — safe to call repeatedly.
         */
        public static function post__opcacheReset(IGlobalReqParams $globals, IRouterUriParams $params): mixed {
            if (!static::isAllowed()) {
                return ControllerTools::JSON(['error' => static::getLabels()['accessDenied']], status: 403);
            }

            if (!function_exists('opcache_reset')) {
                return ControllerTools::JSON([
                    'success' => false,
                    'error' => 'opcache_reset() is not available in this SAPI',
                ], status: 503);
            }

            $ok = @opcache_reset();
            // opcache_reset returns false when OPcache is disabled or the
            // current request already invalidated it — both are non-errors
            // from the caller's perspective (cache is now empty either way).
            return ControllerTools::JSON([
                'success' => true,
                'opcache_reset' => (bool)$ok,
                'sapi' => PHP_SAPI,
            ]);
        }
    }
}
