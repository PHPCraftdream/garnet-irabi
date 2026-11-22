import * as React from 'react';
import {I18nForeground as t} from '../../../../../I18nGen/I18nForeground';
import type {RowWarnings} from './BatchPreviewRow';

export const BatchPreviewWarnings: React.FC<RowWarnings> = ({existingOverlap, proposedOverlap, outOfRange, pastDate}) => (
    <>
        {existingOverlap && <span className="batch-preview-warning" title={t.Batch_Overlap()}>&#9888;</span>}
        {proposedOverlap && <span className="batch-preview-warning" title={t.Batch_ProposedOverlap()}>&#9888;</span>}
        {outOfRange && <span className="batch-preview-warning" title={t.Batch_DateOutOfRange()}>&#9888;</span>}
        {pastDate && <span className="batch-preview-warning" title={t.Batch_PastDate()}>&#9888;</span>}
    </>
);
