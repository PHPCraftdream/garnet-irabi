import * as React from 'react';
import {AntiHookComponent} from '@react-carburetor/core';
import {showToast} from '@common/Components/Feedback/GlobalToast';
import {LogDetailModal} from '@common/Components/Admin/AdminLog/LogDetailModal';
import {I18nForeground as t} from '@/I18nGen/I18nForeground';

interface Props {
    url: string;
    onClose: () => void;
}

/** Ссылка-приглашение: показать, скопировать, открыть. */
function copied(): void {
    showToast(t.Admin_Tokens_Copied(), 'success');
}

    /** Обновляет состояние интерфейса или передаёт действие пользователя обработчику. */
function selectLink(event: React.MouseEvent<HTMLInputElement>): void {
    (event.target as HTMLInputElement).select();
}

export class LinkModal extends AntiHookComponent<Props> {
    /** Обеспечивает работу соответствующей части интерфейса панели администратора. */
    private readonly copy = () => {
        void navigator.clipboard.writeText(this.props.url).then(copied);
    };

    /** Формирует представление данных для соответствующего раздела панели. */
    render() {
        const {url, onClose} = this.props;
        return (
            <LogDetailModal title={t.Admin_Tokens_Link()} onClose={onClose}>
                <div className="token-link-field">
                    <input
                        type="text"
                        className="admin-filter-field"
                        readOnly
                        value={url}
                        data-test-id="token-link-url"
                        onClick={selectLink}
                    />
                </div>
                <div className="token-link-actions">
                    <button type="button" className="primary-action-button" onClick={this.copy}
                        data-test-id="token-link-copy">
                        {t.Admin_Tokens_CopyLink()}
                    </button>
                    <a href={url} target="_blank" rel="noopener noreferrer" className="confirm-modal-cancel"
        data-test-id="token-link-open">
                        {t.Admin_Tokens_OpenLink()}
                    </a>
                    <button type="button" className="confirm-modal-cancel" onClick={onClose}>
                        {t.Action_Close()}
                    </button>
                </div>
            </LogDetailModal>
        );
    }
}
