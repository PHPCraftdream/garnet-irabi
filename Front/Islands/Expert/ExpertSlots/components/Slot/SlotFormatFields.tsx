import * as React from 'react';
import {AntiHookComponent} from '@react-carburetor/core';
import {I18nForeground as t} from '../../../../../I18nGen/I18nForeground';

interface Props {
    isOnline: boolean;
    location: string;
    onIsOnlineChange: (v: boolean) => void;
    onLocationChange: (v: string) => void;
    idPrefix: string;
    labelVariant?: 'edit';
    formatLocked?: boolean;
}

export class SlotFormatFields extends AntiHookComponent<Props> {
    private readonly chooseOnline = () => this.props.onIsOnlineChange(true);
    private readonly chooseOffline = () => this.props.onIsOnlineChange(false);
    private readonly changeLocation = (event: React.ChangeEvent<HTMLInputElement>) => {
        this.props.onLocationChange(event.target.value);
    };

    private renderLabel(text: string) {
        return <label className={this.props.labelVariant === 'edit' ? 'slot-format-label-edit' : 'slot-format-label'}>{text}</label>;
    }

    private renderOption(online: boolean) {
        const {idPrefix, isOnline, formatLocked = false} = this.props;
        return (
            <label className="slot-format-option">
                <input
                    type="radio"
                    name={`${idPrefix}-format`}
                    checked={isOnline === online}
                    onChange={online ? this.chooseOnline : this.chooseOffline}
                    disabled={formatLocked}
                    data-test-id={`${idPrefix}-format-${online ? 'online' : 'offline'}`}
                    className="slot-format-radio"
                />
                <span className="slot-format-option-text">{online ? t.Slot_Online() : t.Slot_Offline()}</span>
            </label>
        );
    }

    private renderLocation() {
        const {isOnline, location, idPrefix} = this.props;
        return (
            <div>
                {this.renderLabel(t.Slot_Location())}
                <input
                    type="text"
                    className="slot-format-location"
                    value={location}
                    onChange={this.changeLocation}
                    placeholder={isOnline ? t.Slot_LocationPlaceholderOnline() : t.Slot_LocationPlaceholderOffline()}
                    data-test-id={`${idPrefix}-location`}
                />
                {!location.trim() && <div className="slot-format-hint">{t.Slot_LocationHint()}</div>}
            </div>
        );
    }

    render() {
        return (
            <>
                <div>
                    {this.renderLabel(t.Slot_Format())}
                    <div className="slot-format-options">
                        {this.renderOption(true)}
                        {this.renderOption(false)}
                    </div>
                </div>
                {this.renderLocation()}
            </>
        );
    }
}
