import * as React from 'react';
import {I18nForeground as t} from '@/I18nGen/I18nForeground';
import type {RowWarnings} from './BatchPreviewRow';

const batchOverlap = t.Batch_Overlap;
const batchProposedOverlap = t.Batch_ProposedOverlap;
const batchDateOutOfRange = t.Batch_DateOutOfRange;
const batchPastDate = t.Batch_PastDate;

/** Подготовить данные для соответствующего интерфейса. */
export const BatchPreviewWarnings: React.FC<RowWarnings> = ({existingOverlap, proposedOverlap, outOfRange,
pastDate}) => (
    <>
        {existingOverlap && <span className="batch-preview-warning" title={batchOverlap()}>&#9888;</span>}
        {proposedOverlap && <span className="batch-preview-warning" title={batchProposedOverlap()}>&#9888;</span>}
        {outOfRange && <span className="batch-preview-warning" title={batchDateOutOfRange()}>&#9888;</span>}
        {pastDate && <span className="batch-preview-warning" title={batchPastDate()}>&#9888;</span>}
    </>
);
