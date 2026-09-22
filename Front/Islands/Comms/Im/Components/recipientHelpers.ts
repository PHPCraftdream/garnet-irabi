import {I18nForeground as t} from '../../../../I18nGen/I18nForeground';

export function getInitials(name: string): string {
    return (name || '?').split(' ').map(w => w[0]?.toUpperCase() || '').slice(0, 2).join('');
}

/**
 * Пометка роли говорит, чем человек занимается.
 *
 * Раньше здесь стояли значки, и они говорили больше: значок преподавателя нёс
 * пол и ставил женское лицо рядом с именем каждого преподавателя-мужчины.
 * Корона и щит тоже несут свои оттенки. Слово называет ровно то, что нужно,
 * и ничего сверх.
 */
export function roleLabel(role: string): string {
    switch (role) {
        case 'expert': return t.Reg_AccountTypeExpert();
        case 'moderator': return t.Admin_Role_Moderator();
        case 'owner': return t.Admin_Role_Owner();
        default: return '';
    }
}
