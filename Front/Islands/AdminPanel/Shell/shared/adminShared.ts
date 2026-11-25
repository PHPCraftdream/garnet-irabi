import {I18nForeground as t} from '../../../../I18nGen/I18nForeground';

/**
 * Мелочи, которые каждый раздел админки писал заново.
 *
 * Подписи пагинатора и сборка списка «Все + люди» лежали одинаковыми копиями
 * в бронях, отменах и отзывах. Копии не расходились только пока их никто не
 * трогал.
 */

export interface AccountOption {
    id: number;
    name: string;
}

/** Обеспечивает работу соответствующей части интерфейса панели администратора. */
function accountOption(item: AccountOption): {value: string; label: string} {
    return {value: String(item.id), label: item.name};
}

/** Список для выпадающего фильтра: «Все» первым пунктом, затем люди. */
export function buildAccountOptions(items: AccountOption[]): {value: string; label: string}[] {
    return [
        {value: '0', label: t.Admin_Filter_All()},
        ...items.map(accountOption),
    ];
}
