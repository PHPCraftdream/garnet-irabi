import {I18nForeground as t} from '../../I18nGen/I18nForeground';

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

export const adminPaginationLabels = {
    prev: t.Pagination_Prev(),
    next: t.Pagination_Next(),
    of: t.Pagination_Of(),
    items: t.Pagination_Items(),
};

/** Список для выпадающего фильтра: «Все» первым пунктом, затем люди. */
export function buildAccountOptions(items: AccountOption[]): {value: string; label: string}[] {
    return [
        {value: '0', label: t.Admin_Filter_All()},
        ...items.map(a => ({value: String(a.id), label: a.name})),
    ];
}
