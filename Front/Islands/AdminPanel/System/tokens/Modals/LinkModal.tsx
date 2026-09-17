import * as React from 'react';
import {showToast} from '@common/Components/Feedback/GlobalToast';
import {LogDetailModal} from '@common/Components/Admin/AdminLog/LogDetailModal';
import {I18nForeground as t} from '../../../../../I18nGen/I18nForeground';

interface Props {
    url: string;
    onClose: () => void;
}

/** Ссылка-приглашение: показать, скопировать, открыть. */
export const LinkModal: React.FC<Props> = ({url, onClose}) => {
    const handleCopy = () => {
        void navigator.clipboard.writeText(url).then(() => showToast(t.Admin_Tokens_Copied(), 'success'));
    };

    return (
        <LogDetailModal title={t.Admin_Tokens_Link()} onClose={onClose}>
            <div className="mb-4">
                <input
                    type="text"
                    className="form-control w-full"
                    readOnly
                    value={url}
                    data-test-id="token-link-url"
                    onClick={e => (e.target as HTMLInputElement).select()}
                />
            </div>
            <div className="flex gap-2">
                <button type="button" className="btn btn-primary" onClick={handleCopy} data-test-id="token-link-copy">
                    {t.Admin_Tokens_CopyLink()}
                </button>
                <a href={url} target="_blank" rel="noopener noreferrer" className="btn btn-secondary" data-test-id="token-link-open">
                    {t.Admin_Tokens_OpenLink()}
                </a>
                <button type="button" className="btn btn-secondary" onClick={onClose}>
                    {t.Action_Close()}
                </button>
            </div>
        </LogDetailModal>
    );
};
