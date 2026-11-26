import * as React from 'react';
import {AntiHookComponent} from '@react-carburetor/core';
import {Portal} from '@common/Components/Layout/Portal';
import {I18nForeground as t} from '@/I18nGen/I18nForeground';

interface Props {
    title: string;
    testId: string;
    size: 'single' | 'batch';
    onClose: () => void;
    children: React.ReactNode;
}

export class ExpertSlotModalShell extends AntiHookComponent<Props> {
    /** Обработать соответствующее действие пользователя. */
    private readonly closeOnBackdrop = (event: React.MouseEvent<HTMLDivElement>) => {
        if (event.target === event.currentTarget) this.props.onClose();
    };

    /** Отобразить соответствующую часть интерфейса. */
    private renderHeader() {
        const {title, onClose, testId} = this.props;
        return (
            <div className="expert-slot-modal-header">
                <h3 className="expert-slot-modal-title">{title}</h3>
                <button
                    type="button"
                    className="expert-slot-modal-close"
                    onClick={onClose}
                    title={t.Action_Close()}
                    data-test-id={`${testId}-close`}
                >&times;</button>
            </div>
        );
    }

    /** Отобразить соответствующую часть интерфейса. */
    render() {
        const {size, testId, children} = this.props;
        return (
            <Portal>
                <div className="expert-slot-modal-overlay" onClick={this.closeOnBackdrop} data-test-id={testId}>
                    <div className={size === 'batch' ? 'expert-slot-modal-wide' : 'expert-slot-modal-card'}>
                        {this.renderHeader()}
                        <div className="expert-slot-modal-body">{children}</div>
                    </div>
                </div>
            </Portal>
        );
    }
}
