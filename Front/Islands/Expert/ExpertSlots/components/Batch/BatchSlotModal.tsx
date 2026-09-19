import * as React from 'react';
import {Portal} from '@common/Components/Layout/Portal';
import {I18nForeground as t} from '../../../../../I18nGen/I18nForeground';
import {Slot} from '../../types';
import {BatchSlotWizard} from './BatchSlotWizard';

interface Props {
    open: boolean;
    onClose: () => void;
    onSuccess: (msg: string, newSlots?: Slot[]) => void;
    onError: (msg: string) => void;
    onConfirm: (message: string, items: string[]) => Promise<boolean>;
}

export const BatchSlotModal: React.FC<Props> = ({open, onClose, onSuccess, onError, onConfirm}) => {
    if (!open) return null;

    return (
        <Portal>
            <div
                className="fg-modal-overlay"
                onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
                data-test-id="batch-slot-modal"
            >
                <div className="fg-modal-card-flush fg-modal-card-3xl">
                    <div className="fg-modal-flush-header">
                        <h3 className="fg-modal-title">{t.Batch_Title()}</h3>
                        <button
                            type="button"
                            className="fg-modal-close-x"
                            onClick={onClose}
                            title={t.Action_Close()}
                            data-test-id="batch-slot-modal-close"
                        >
                            &times;
                        </button>
                    </div>
                    <div className="fg-modal-flush-body">
                        <BatchSlotWizard
                            onSuccess={onSuccess}
                            onError={onError}
                            onConfirm={onConfirm}
                            onCancel={onClose}
                        />
                    </div>
                </div>
            </div>
        </Portal>
    );
};
