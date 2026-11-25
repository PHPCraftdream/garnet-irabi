import * as React from 'react';

/** Отображает данные раздела и передаёт действия пользователя обработчикам. */
export const SectionTitle: React.FC<{children: React.ReactNode}> = ({children}) => (
    <h3 className="admin-user-history-title">{children}</h3>
);
