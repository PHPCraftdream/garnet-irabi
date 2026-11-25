import type {SlotItem} from '../view/types';

/** Возвращает копию списка, отсортированную по времени начала. */
export function sortByStart(slots: readonly SlotItem[]): SlotItem[] {
    const out = slots.slice();
    for (let i = 1; i < out.length; i++) {
        const item = out[i];
        let j = i - 1;
        while (j >= 0 && out[j].start_at > item.start_at) {
            out[j + 1] = out[j];
            j--;
        }
        out[j + 1] = item;
    }
    return out;
}
