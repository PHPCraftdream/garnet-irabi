<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Migrations\Items {
    use Aura\Cli\Stdio;
    use PHPCraftdream\Garnet\Kernel\Db\Link\DbPool;
    use PHPCraftdream\Garnet\Kernel\Interfaces\Migration\IMigrationItem;
    use PHPCraftdream\IRabi\Common\Tables\ExpertProfiles;

    /**
     * Профиль преподавателя был копией аккаунта. Копия разошлась.
     *
     * В `expert_profiles` было пять колонок сверх ключа, и ни одна не хранила
     * ничего своего:
     *
     *  - `display_name` — снимок `accounts.name`, снятый один раз при
     *    одобрении и с тех пор не обновлявшийся;
     *  - `bio` — двойник `accounts.about`. Форма профиля писала в аккаунт, а
     *    публичная карточка читала двойника, поэтому «О себе» не показывалось
     *    никогда и ни у кого;
     *  - `specialization` — не писал никто, кроме тестовых данных; блок на
     *    экране обещал то, чего система не умела сохранять;
     *  - `photo` — двойник `accounts.photo`, всегда NULL;
     *  - `is_approved` — двойник флага `IS_APPROVED`.
     *
     * Последняя обошлась дороже всех. На боевом она осталась в нуле у троих
     * одобренных преподавателей, и превью, проверявшее одобрение по копии, а
     * не по флагу, молча показывало пустоту вместо профиля. Тот же перекос
     * раньше уже чинили в каталоге слотов — там устаревшая копия прятала
     * имена преподавателей с карточек и из диалога бронирования.
     *
     * Все читатели переведены на аккаунт (`ExpertDirectory`,
     * `UserEntityConfig::isApprovedExpertAccount`), записи убраны. Таблица
     * больше никому не нужна.
     *
     * Класс `ExpertProfiles` намеренно остаётся в коде: на него ссылается
     * `M_0002`, и без него история миграций не проиграется на чистой базе.
     *
     * Идемпотентна: `DROP TABLE IF EXISTS`. Обратного хода нет — данные в
     * колонках либо дублировали аккаунт, либо были пусты, восстанавливать
     * нечего.
     */
    class M_0023 implements IMigrationItem {
        public static function update(Stdio $stdio): void {
            $pool = DbPool::get();
            $table = ExpertProfiles::get()->getTableName();

            $exists = $pool->query("SHOW TABLES LIKE '{$table}'");

            if (empty($exists)) {
                $stdio->outln("M_0023: {$table} уже удалена, пропуск");

                return;
            }

            $pool->query("DROP TABLE IF EXISTS `{$table}`");
            $stdio->outln("M_0023: удалена {$table} — дубликат аккаунта");
        }
    }
}
