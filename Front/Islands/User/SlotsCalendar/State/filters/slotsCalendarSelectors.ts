import type { TimeOfDay, SlotType, OnlineFilter } from "../view/types";

export type ReadonlyFiltersState = {
  readonly expertIds: ReadonlySet<string>;
  readonly priceMin: string;
  readonly priceMax: string;
  readonly timeOfDay: TimeOfDay;
  readonly slotType: SlotType;
  readonly onlineFilter: OnlineFilter;
};
