/** Проверить, наступила ли дата занятия. */
export function isDateInPast(date: string, time: string): boolean {
    const now = new Date();
    const slotDate = new Date(date + 'T' + (time || '00:00'));
    return slotDate < now;
}
