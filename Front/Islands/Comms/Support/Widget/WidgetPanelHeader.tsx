import * as React from 'react';

import {I18nForeground as t} from '../../../../I18nGen/I18nForeground';

interface PanelHeaderProps {
    pageUrl: string;
    onClose: () => void;
}

/** Шапка панели. */
export const WidgetPanelHeader: React.FC<PanelHeaderProps> = ({pageUrl, onClose}) => (
    <div className="support-widget-header">
        <span className="support-widget-title">{t.Support_Widget_Title()}</span>
        <div className="flex items-center gap-2">
            <a href={pageUrl} className="support-widget-link">{t.Support_ViewAll()}</a>
            <button type="button" className="support-widget-close" title={t.Action_Close()} onClick={onClose}>
                &times;
            </button>
        </div>
    </div>
);
