import * as React from 'react';

export type FlagButtonTone = 'btn-outline-danger' | 'btn-outline-primary' | 'btn-outline-secondary' |
    'btn-success' | 'btn-secondary';

    /** Обеспечивает работу соответствующей части интерфейса панели администратора. */
export function FlagBtn({label, active, cls, disabled, onClick, testId, title}: {
    label: string;
    active: boolean;
    cls: [FlagButtonTone, FlagButtonTone]; // [активное состояние, неактивное состояние]
    disabled: boolean;
    onClick: () => void;
    testId?: string;
    title?: string;
}) {
    return (
        <button
            type="button"
            data-test-id={testId}
            title={title}
            className={(active ? cls[0] : cls[1]) === 'btn-success' ? 'admin-user-flag-success' : 'admin-user-flag'}
            data-tone={active ? cls[0] : cls[1]}
            disabled={disabled}
            onClick={onClick}
        >
            {label}
        </button>
    );
}
