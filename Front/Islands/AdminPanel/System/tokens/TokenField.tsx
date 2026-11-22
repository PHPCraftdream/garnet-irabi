import * as React from 'react';

interface Props {
    id: string;
    label: string;
    hint?: string;
    children: React.ReactNode;
}

/**
 * Поле формы приглашения: подпись, само поле, пояснение под ним.
 *
 * Четыре окна повторяли одну и ту же обвязку из трёх элементов вокруг
 * каждого поля — и каждое такое повторение добавляло уровень вложенности.
 */
export const TokenField: React.FC<Props> = ({id, label, hint, children}) => (
    <div className="token-field">
        <label htmlFor={id} className="token-field-label">{label}</label>
        {children}
        {hint && <p className="token-field-hint">{hint}</p>}
    </div>
);
