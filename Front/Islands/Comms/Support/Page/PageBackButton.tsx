import * as React from 'react';

import {I18nForeground as t} from '../../../../I18nGen/I18nForeground';
import {ChevronLeft} from 'lucide-react';

const supportBackToList = t.Support_BackToList;

/** Рисует кнопку возврата к списку. */
export const PageBackButton: React.FC<{onBack: () => void}> = ({onBack}) => (
    <button type="button" className="comms-page-back" onClick={onBack}>
        <ChevronLeft size={16} aria-hidden="true" />
        {supportBackToList()}
    </button>
);
