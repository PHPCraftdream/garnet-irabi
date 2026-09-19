import * as React from 'react';
import {I18nForeground as t} from '../../I18nGen/I18nForeground';

interface AttachmentAddButtonProps {
    count: number;
    maxFiles: number;
    onPick: () => void;
}

export const AttachmentAddButton: React.FC<AttachmentAddButtonProps> = ({count, maxFiles, onPick}) => (
    <button
        type="button"
        className="btn btn-outline-secondary text-sm flex items-center gap-1"
        onClick={onPick}
        data-test-id="attachment-btn"
        title={t.A11y_AttachFiles()}
        aria-label={t.A11y_AttachFiles()}
    >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
        </svg>
        {count > 0 ? `(${count}/${maxFiles})` : ''}
    </button>
);
