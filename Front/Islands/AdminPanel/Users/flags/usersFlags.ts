/** Подпись кнопки показывает роль и действие, которое выполнит переключение. */
export function roleFlagLabel(role: string, granted: boolean): string {
    return `${granted ? '−' : '+'} ${role}`;
}
