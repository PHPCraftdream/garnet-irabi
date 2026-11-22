import * as React from 'react';
import {I18nForeground as t} from '../../../../../../I18nGen/I18nForeground';
import {Slot} from '../../../types';

interface Props {
    slot: Slot;
    onUserClick?: (userId: number, userName: string) => void;
}

export class CalendarSlotUser extends React.Component<Props> {
    private readonly openUser = (event: React.MouseEvent<HTMLButtonElement>) => {
        event.stopPropagation();
        const {slot, onUserClick} = this.props;
        onUserClick?.(slot.user_id!, slot.user_name!);
    };

    public render() {
        const {slot} = this.props;
        return (
            <div className="expert-slot-user-row">
                <span className="expert-slot-user-label">{t.Slot_User()}: </span>
                <button
                    type="button"
                    className="expert-slot-user-link"
                    onClick={this.openUser}
                    data-test-id={`user-link-${slot.id}`}
                >
                    {slot.user_name}
                </button>
            </div>
        );
    }
}
