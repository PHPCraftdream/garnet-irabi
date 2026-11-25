import * as React from 'react';
import {I18nForeground as t} from '../../../../../../I18nGen/I18nForeground';

const batchCancel = t.Batch_Cancel;
const batchPreview = t.Batch_Preview;

interface BatchFormFooterProps {
    onCancel?: () => void;
    showPreview: boolean;
}

/** Кнопки отмены и перехода к просмотру расписания группы. */
export const BatchFormFooter: React.FC<BatchFormFooterProps> = (props) => (
    <div className="batch-form-footer">
        {props.onCancel && !props.showPreview && (
            <button type="button" className="confirm-modal-cancel" onClick={props.onCancel}>
                {batchCancel()}
            </button>
        )}
        <button type="submit" className="primary-action-button" data-test-id="batch-preview-btn">
            {batchPreview()}
        </button>
    </div>
);
