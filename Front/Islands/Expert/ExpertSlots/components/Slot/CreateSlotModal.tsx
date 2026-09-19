import * as React from 'react';
import {Portal} from '@common/Components/Layout/Portal';
import {I18nForeground as t} from '../../../../../I18nGen/I18nForeground';
import {IFromFieldsInfo} from '@common/Dom/GridTable/Models';
import {Slot} from '../../types';
import {CreateSlotForm} from './CreateSlotForm';

interface Props {
    open: boolean;
    onClose: () => void;
    onSuccess: (newSlot?: Slot) => void;
    onError: (msg: string) => void;
    fieldsInfo: IFromFieldsInfo;
    defaultPenaltyPercent: number;
}

export const CreateSlotModal: React.FC<Props> = ({open, onClose, onSuccess, onError, fieldsInfo, defaultPenaltyPercent}) => {
    if (!open) return null;

    return (
        <Portal>
            <div
                className="fg-modal-overlay"
                onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
                data-test-id="create-slot-modal"
            >
                <div className="fg-modal-card-flush fg-modal-card-lg">
                    <div className="fg-modal-flush-header">
                        <h3 className="fg-modal-title">{t.Slot_Create()}</h3>
                        <button
                            type="button"
                            className="fg-modal-close-x"
                            onClick={onClose}
                            title={t.Action_Close()}
                            data-test-id="create-slot-modal-close"
                        >
                            &times;
                        </button>
                    </div>
                    <div className="fg-modal-flush-body">
                        <CreateSlotForm
                            onSuccess={onSuccess}
                            onError={onError}
                            fieldsInfo={fieldsInfo}
                            defaultPenaltyPercent={defaultPenaltyPercent}
                            onCancel={onClose}
                        />
                    </div>
                </div>
            </div>
        </Portal>
    );
};
