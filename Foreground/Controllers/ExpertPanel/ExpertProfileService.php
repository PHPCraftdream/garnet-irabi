<?php declare(strict_types=1);

/**
 * Сервис публичного профиля эксперта: просмотр и редактирование
 * display_name / bio / specialization текущим экспертом.
 *
 * Фото (expert_profiles.photo) намеренно НЕ затрагивается —
 * оно управляется отдельным upload-флоу и не входит в scope этой задачи.
 *
 * Доступ: страница (profilePage) открыта любому эксперту, в т.ч. неодобренному
 * (по аналогии с get__slots — заполнить профиль до/во время ожидания одобрения).
 * Само сохранение (updateProfile) вызывается из контроллера только после
 * mayMutate() (одобренный эксперт ИЛИ модератор+) — defense-in-depth инвариант
 * security audit A-02, единый для всех мутирующих /expert/~* эндпоинтов.
 */

namespace PHPCraftdream\IRabi\Foreground\Controllers\ExpertPanel {
    use PHPCraftdream\Garnet\Bundle\Utils\RenderIsland;
    use PHPCraftdream\Garnet\Kernel\Db\Entity\Account\Account;
    use PHPCraftdream\Garnet\Kernel\Interfaces\IGlobalReqParams;
    use PHPCraftdream\Garnet\Kernel\Io\Router\ControllerTools;
    use PHPCraftdream\IRabi\Common\Tables\ExpertProfiles;
    use PHPCraftdream\IRabi\Foreground\I18n\ForegroundI18n;
    use PHPCraftdream\IRabi\IRabi;

    class ExpertProfileService {
        /**
         * Лимиты длин полей — дублируются серверной валидацией в updateProfile()
         * и клиентской в ExpertProfileEditIsland. bio имеет разумный максимум
         * (2000 символов), display_name/specialization — под VARCHAR(255).
         */
        public const DISPLAY_NAME_MAX = 255;
        public const SPECIALIZATION_MAX = 255;
        public const BIO_MAX = 2000;

        /**
         * Страница редактирования публичного профиля эксперта.
         *
         * @param callable(string): string $renderContent
         */
        public static function profilePage(IGlobalReqParams $globals, Account $account, callable $renderContent): mixed {
            $profile = static::getOrCreateProfile($account);

            $content = RenderIsland::render('expert-profile-edit', [
                'profile' => [
                    'display_name' => (string)($profile['display_name'] ?? ''),
                    'bio' => (string)($profile['bio'] ?? ''),
                    'specialization' => (string)($profile['specialization'] ?? ''),
                ],
                'limits' => [
                    'display_name' => self::DISPLAY_NAME_MAX,
                    'specialization' => self::SPECIALIZATION_MAX,
                    'bio' => self::BIO_MAX,
                ],
                'isApproved' => $account->isApproved(),
                'saveUrl' => IRabi::url('/expert/~profile'),
                'publicProfileUrl' => IRabi::url('/expert/id~' . $account->id()),
            ]);

            return $renderContent($content);
        }

        /**
         * Сохранение display_name / bio / specialization для ТЕКУЩЕГО эксперта.
         * account_id берётся из сессии — никакого чужого id из параметров.
         */
        public static function updateProfile(IGlobalReqParams $globals, Account $account): mixed {
            $t = ForegroundI18n::getInstance();

            $displayName = trim((string)$globals->readPostValue('display_name', ''));
            $specialization = trim((string)$globals->readPostValue('specialization', ''));
            $bio = (string)$globals->readPostValue('bio', '');

            if ($displayName === '') {
                return ControllerTools::JSON(['error' => $t->ExpertProfile_DisplayNameRequired()], status: 400);
            }

            $displayNameMb = mb_strlen($displayName);
            if ($displayNameMb > self::DISPLAY_NAME_MAX) {
                return ControllerTools::JSON(['error' => $t->ExpertProfile_DisplayNameTooLong()], status: 400);
            }

            if (mb_strlen($specialization) > self::SPECIALIZATION_MAX) {
                return ControllerTools::JSON(['error' => $t->ExpertProfile_SpecializationTooLong()], status: 400);
            }

            if (mb_strlen($bio) > self::BIO_MAX) {
                return ControllerTools::JSON(['error' => $t->ExpertProfile_BioTooLong()], status: 400);
            }

            // Гарантируем наличие строки профиля (ленивая вставка, как в ExpertSlotsService).
            static::getOrCreateProfile($account);

            ExpertProfiles::get()->updateByField(
                [
                    'display_name' => $displayName,
                    'bio' => $bio,
                    'specialization' => $specialization,
                ],
                'account_id',
                $account->id(),
            );

            return ControllerTools::JSON([
                'success' => true,
                'profile' => [
                    'display_name' => $displayName,
                    'bio' => $bio,
                    'specialization' => $specialization,
                ],
            ]);
        }

        /**
         * Вернуть строку expert_profiles для текущего аккаунта; создать пустую,
         * если её ещё нет — тот же ленивый паттерн, что в
         * ExpertSlotsService::createSlot()/batchSlots() при создании первого слота.
         */
        private static function getOrCreateProfile(Account $account): array {
            $profile = ExpertProfiles::get()->selectOneByField('account_id', $account->id());
            if ($profile) {
                return $profile;
            }

            ExpertProfiles::get()->insert([
                'account_id' => $account->id(),
                'display_name' => $account->readParam('name') ?: '',
                'bio' => '',
                'specialization' => '',
                'is_approved' => 0,
            ]);

            return ExpertProfiles::get()->selectOneByField('account_id', $account->id());
        }
    }
}
