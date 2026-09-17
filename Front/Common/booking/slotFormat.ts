import {I18nForeground as t} from '../../I18nGen/I18nForeground';

/**
 * Всё, что нужно, чтобы сказать человеку, как пройдёт занятие.
 *
 * `location` у очного занятия — адрес, у онлайнового — ссылка на встречу,
 * и наружу она не отдаётся: сервер вместо неё присылает `platform` —
 * публичное имя площадки («Zoom», «Google Meet»). Поэтому здесь два поля,
 * а не одно.
 */
export interface SlotFormatSource {
    is_online: number | boolean;
    location?: string;
    platform?: string;
}

/**
 * Где и как пройдёт занятие — одной строкой: «Онлайн · Zoom» или
 * «Очно · ул. Ленина, 5».
 *
 * До этого на экране стояло одно слово формата, и человек шёл спрашивать
 * преподавателя, будет ли видеосвязь прямо на сайте или пришлют ссылку, —
 * причём уже после оплаты (D-052). Формат должен быть виден заранее и всем.
 *
 * Если сказать нечего — уточнения нет, остаётся одно слово. Пустой хвост
 * после разделителя хуже его отсутствия: он выглядит как потерянные данные.
 */
export function slotFormatLine(slot: SlotFormatSource): string {
    const online = !!Number(slot.is_online);
    const word = online ? t.Slots_Online() : t.Slots_Offline();
    const detail = (online ? slot.platform : slot.location)?.trim();

    return detail ? `${word} · ${detail}` : word;
}

/**
 * Подпись для строки-уточнения там, где формат и место показаны отдельными
 * полями: у онлайна это площадка, у очного — адрес.
 */
export function slotPlaceLabel(slot: SlotFormatSource): string {
    return Number(slot.is_online) ? t.Slot_Platform() : t.Slot_Location();
}

/** Само уточнение — площадка или адрес; пустая строка, если его нет. */
export function slotPlaceValue(slot: SlotFormatSource): string {
    const value = (Number(slot.is_online) ? slot.platform : slot.location) ?? '';

    return value.trim();
}

/**
 * Занятость группового занятия одной строкой: «осталось 1 из 3».
 *
 * Живёт здесь, а не в карточке, по той же причине, по которой на сервере
 * появился SlotCardPayload: пока каждая витрина решала сама, признак слота
 * терялся то на одной, то на другой — «Групповое» пропадало на главной
 * (D-141), на странице преподавателя (D-178) и на карточке брони (D-189), а
 * остаток мест появился в каталоге и не появился ни в тултипе того же
 * каталога (D-196), ни на странице преподавателя (D-200).
 *
 * Пустая строка означает «показывать нечего»: индивидуальное занятие или
 * сервер не прислал занятость. Ноль местами не путается — 0 свободных мест
 * это `осталось 0 из N`, а не отсутствие ответа.
 */
export interface SeatsSource {
    max_users?: number;
    booked_count?: number;
}

export function slotSeatsLeftLine(slot: SeatsSource): string {
    const max = slot.max_users ?? 1;

    if (max <= 1 || typeof slot.booked_count !== 'number') return '';

    return t.Slot_SeatsLeft([String(Math.max(0, max - slot.booked_count)), String(max)]);
}
