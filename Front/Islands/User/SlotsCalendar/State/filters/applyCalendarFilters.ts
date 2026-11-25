import type { SlotItem } from "../view/types";
import type { ReadonlyFiltersState } from "./slotsCalendarSelectors";
import { tsToHour } from "@common/Utils/Time/DateUtils";

/** Applies the property filters selected for the slots calendar. */
export function applyCalendarFilters(
  slots: readonly SlotItem[],
  filters: ReadonlyFiltersState,
) {
  return slots.filter((slot) => {
    if (
      filters.expertIds.size > 0 &&
      !filters.expertIds.has(String(slot.expert_id))
    )
      return false;
    if (filters.priceMin !== "") {
      const min = Number(filters.priceMin);
      if (!isNaN(min) && slot.cost < min) return false;
    }
    if (filters.priceMax !== "") {
      const max = Number(filters.priceMax);
      if (!isNaN(max) && slot.cost > max) return false;
    }
    if (filters.timeOfDay !== "all") {
      const hour = tsToHour(slot.start_at);
      if (filters.timeOfDay === "morning" && hour >= 12) return false;
      if (filters.timeOfDay === "day" && (hour < 12 || hour >= 17))
        return false;
      if (filters.timeOfDay === "evening" && hour < 17) return false;
    }
    if (filters.onlineFilter !== "all") {
      if (filters.onlineFilter === "online" && !slot.is_online) return false;
      if (filters.onlineFilter === "offline" && slot.is_online) return false;
    }
    if (filters.slotType !== "all") {
      const isGroup = (slot.max_users || 1) > 1;
      if (filters.slotType === "individual" && isGroup) return false;
      if (filters.slotType === "group" && !isGroup) return false;
    }
    return true;
  });
}
