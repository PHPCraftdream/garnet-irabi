import * as React from 'react';

import {I18nForeground as t} from '../../../../I18nGen/I18nForeground';
import {ChevronLeft} from 'lucide-react';

export const PageBackButton: React.FC<{onBack: () => void}> = ({onBack}) => (
    <button type="button" className="support-back-btn" onClick={onBack}>
        <ChevronLeft size={16} aria-hidden="true" />
        {t.Support_BackToList()}
    </button>
);
