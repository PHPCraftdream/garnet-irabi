import * as React from 'react';
import {AntiHookComponent} from '@react-carburetor/core';
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

export class AttachmentAddRow extends AntiHookComponent<AttachmentAddRowProps> {
    private readonly handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        if (event.target.files) this.props.onFiles(event.target.files);
    };

    public render() {
        const {inputRef, accept, count, maxFiles, onPick, hint} = this.props;
        return (
            <>
                <input
                    ref={inputRef}
                    type="file"
                    multiple
                    accept={accept || 'image/*,.pdf,.txt,.log'}
                    className="attachment-input"
                    aria-label={t.A11y_AttachFiles()}
                    onChange={this.handleChange}
                    data-test-id="attachment-input"
                />
                <div className="attachment-row">
                    <AttachmentAddButton count={count} maxFiles={maxFiles} onPick={onPick} />
                    {/* The limits belong here, before a file is chosen — a
                        rejection is a poor way to learn what was allowed. */}
                    <span className="attachment-hint" data-test-id="attachment-hint">
                        {hint}
                    </span>
                </div>
            </>
        );
    }
}
