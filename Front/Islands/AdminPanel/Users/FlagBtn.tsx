import * as React from 'react';

export function FlagBtn({label, active, cls, disabled, onClick, testId, title}: {
    label: string;
    active: boolean;
    cls: [string, string]; // [active class, inactive class]
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
            className={`btn btn-sm ${active ? cls[0] : cls[1]}`}
            disabled={disabled}
            onClick={onClick}
        >
            {label}
        </button>
    );
}
