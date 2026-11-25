const initial = (word: string): string => word[0]?.toUpperCase() || '';

/** Возвращает инициалы из имени. */
export function getInitials(name: string): string {
    return (name || '?').split(' ').slice(0, 2).map(initial).join('');
}
