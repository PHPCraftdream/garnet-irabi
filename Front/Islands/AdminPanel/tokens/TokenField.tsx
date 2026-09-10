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
    <div className="mb-3">
        <label htmlFor={id} className="label-mini mb-1">{label}</label>
        {children}
        {hint && <p className="text-xs text-muted mt-1">{hint}</p>}
    </div>
);
