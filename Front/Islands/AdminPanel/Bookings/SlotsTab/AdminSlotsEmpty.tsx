import * as React from 'react';
import {I18nForeground as t} from '../../../../I18nGen/I18nForeground';

const admin_NoSlots = t.Admin_NoSlots;

/** Отображает данные раздела и передаёт действия пользователя обработчикам. */
export const AdminSlotsEmpty: React.FC = () => (
    <p className="admin-bookings-empty">{admin_NoSlots()}</p>
);
