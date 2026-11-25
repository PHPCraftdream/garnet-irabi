/** Проверяет, установлен ли флаг учётной записи. */
export function flag(val: string | number | null | undefined): boolean {
    return val !== null && val !== undefined && Number(val) > 0;
}
