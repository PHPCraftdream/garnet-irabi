import * as React from 'react';
import {I18nForeground as t} from '../../../I18nGen/I18nForeground';

interface Props {
    isOnline: boolean;
    location: string;
    onIsOnlineChange: (v: boolean) => void;
    onLocationChange: (v: string) => void;
    /** Unique prefix for radio `name` and `data-test-id` (e.g. 'slot', 'batch', 'edit-slot'). */
    idPrefix: string;
    /** Defaults to 'form-label'; EditSlotModal passes its own label class. */
    labelClassName?: string;
}

/**
 * Shared "Format" (Online/Offline) + "Location" fields used by the three
 * expert slot surfaces (create, batch, edit). Keeping the markup in one
 * place guarantees the toggle/placeholder/hint stay consistent everywhere.
 */
export const SlotFormatFields: React.FC<Props> = ({
    isOnline,
    location,
    onIsOnlineChange,
    onLocationChange,
    idPrefix,
    labelClassName = 'form-label',
}) => {
    const locationPlaceholder = isOnline
        ? t.Slot_LocationPlaceholderOnline()
        : t.Slot_LocationPlaceholderOffline();

    return (
        <>
            <div>
                <label className={labelClassName}>{t.Slot_Format()}</label>
                <div className="flex gap-3">
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input
                            type="radio"
                            name={`${idPrefix}-format`}
                            checked={isOnline}
                            onChange={() => onIsOnlineChange(true)}
                            data-test-id={`${idPrefix}-format-online`}
                            className="accent-theme"
                        />
                        <span className="text-sm">{t.Slot_Online()}</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input
                            type="radio"
                            name={`${idPrefix}-format`}
                            checked={!isOnline}
                            onChange={() => onIsOnlineChange(false)}
                            data-test-id={`${idPrefix}-format-offline`}
                            className="accent-theme"
                        />
                        <span className="text-sm">{t.Slot_Offline()}</span>
                    </label>
                </div>
            </div>
            <div>
                <label className={labelClassName}>{t.Slot_Location()}</label>
                <input
                    type="text"
                    className="form-control"
                    value={location}
                    onChange={e => onLocationChange(e.target.value)}
                    placeholder={locationPlaceholder}
                    data-test-id={`${idPrefix}-location`}
                />
                {!location.trim() && (
                    <div className="text-xs text-muted mt-1">{t.Slot_LocationHint()}</div>
                )}
            </div>
        </>
    );
};
