import * as React from 'react';
import {I18nForeground as t} from '../../../../I18nGen/I18nForeground';

export const AdminSlotsEmpty: React.FC = () => (
    <p className="admin-bookings-empty">{t.Admin_NoSlots()}</p>
);
