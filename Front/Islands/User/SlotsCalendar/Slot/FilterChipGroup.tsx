import * as React from 'react';

interface FilterChipGroupProps<T extends string> {
    options: readonly [T, string][];
    value: T;
    onChange: (value: T) => void;
    testIdPrefix: string;
}

export function FilterChipGroup<T extends string>({options, value, onChange, testIdPrefix}: FilterChipGroupProps<T>) {
    return (
        <div className="flex flex-wrap gap-1" role="tablist">
            {options.map(([val, label]) => (
                <button key={val} role="tab" aria-selected={value === val} className={`chip ${value === val ? 'chip-active' : ''}`} onClick={() => onChange(val)} data-test-id={`${testIdPrefix}-${val}`}>{label}</button>
            ))}
        </div>
    );
}
