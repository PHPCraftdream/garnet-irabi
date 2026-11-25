import type {SlotItem} from '../../State/view/types';

/** Стоимость выбранных слотов — та же сумма, что показывает модалка. */
export function priceFor(
    ids: readonly number[],
    slots: readonly SlotItem[],
): number {
    let sum = 0;
    for (const id of ids) sum += slots.find((slot) => slot.id === id)?.cost ?? 0;
    return sum;
}
