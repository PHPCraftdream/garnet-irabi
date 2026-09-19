import * as React from 'react';
import {I18nForeground as t} from '../../I18nGen/I18nForeground';
import {AttachmentAddButton} from './AttachmentAddButton';

interface AttachmentAddRowProps {
    inputRef: React.RefObject<HTMLInputElement>;
    accept?: string;
    onFiles: (files: FileList) => void;
    count: number;
    maxFiles: number;
    onPick: () => void;
    hint: string;
}

export const AttachmentAddRow: React.FC<AttachmentAddRowProps> = ({inputRef, accept, onFiles, count, maxFiles, onPick, hint}) => (
    <>
        <input
            ref={inputRef}
            type="file"
            multiple
            accept={accept || 'image/*,.pdf,.txt,.log'}
            className="hidden"
            aria-label={t.A11y_AttachFiles()}
            onChange={(e) => e.target.files && onFiles(e.target.files)}
            data-test-id="attachment-input"
        />
        <div className="flex items-center gap-2 flex-wrap">
            <AttachmentAddButton count={count} maxFiles={maxFiles} onPick={onPick} />
            {/* The limits belong here, before a file is chosen — a
                rejection is a poor way to learn what was allowed. */}
            <span className="text-xs text-muted" data-test-id="attachment-hint">
                {hint}
            </span>
        </div>
    </>
);
