import { I18nForeground as t } from "../../../../../I18nGen/I18nForeground";
import type { SlotItem } from "../view/types";

interface PagerCountItem {
  key: "free" | "mine";
  count: number;
  label: string;
  kind: "free" | "mine";
}

/** Создаёт нулевые счётчики доступных и занятых слотов. */
function emptyCounts(): { free: number; mine: number } {
  return { free: 0, mine: 0 };
}

/** Преобразует счётчики слотов в элементы фильтра календаря. */
function toItems(counts: { free: number; mine: number }): PagerCountItem[] {
  return [
    { key: "free", count: counts.free, label: t.Slots_FilterFree(), kind: "free" },
    { key: "mine", count: counts.mine, label: t.Slots_FilterMine(), kind: "mine" },
  ];
}

/** Counts free and booked slots in each calendar paging range. */
export function getPagerCounts(
  propertyFilteredSlots: readonly SlotItem[],
  ws: number,
  we: number,
  effectiveBookedIds: ReadonlySet<number>,
  slotStatuses: Readonly<Record<string, string>>,
) {
  const prev = emptyCounts(),
    next = emptyCounts(),
    now = emptyCounts();
  for (const slot of propertyFilteredSlots) {
    const mine =
      effectiveBookedIds.has(slot.id) &&
      (slotStatuses[String(slot.id)] || "") !== "cancelled";
    const free = !effectiveBookedIds.has(slot.id) && slot.status === "free";
    if (!mine && !free) continue;
    const bucket = slot.start_at < ws ? prev : slot.start_at >= we ? next : now;
    if (mine) bucket.mine++;
    else bucket.free++;
  }
  return { prev: toItems(prev), next: toItems(next), now: toItems(now) };
}
