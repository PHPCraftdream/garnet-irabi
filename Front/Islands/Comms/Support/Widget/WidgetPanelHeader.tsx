import * as React from 'react';

import {I18nForeground as t} from '@/I18nGen/I18nForeground';

const supportWidgetTitle = t.Support_Widget_Title;
const supportViewAll = t.Support_ViewAll;
const actionClose = t.Action_Close;

interface PanelHeaderProps {
    pageUrl: string;
    onClose: () => void;
}

/** Шапка панели. */
export const WidgetPanelHeader: React.FC<PanelHeaderProps> = ({pageUrl, onClose}) => (
    <div className="support-widget-header">
        <span className="support-widget-title">{supportWidgetTitle()}</span>
        <div className="widget-header-actions">
            <a href={pageUrl} className="support-widget-link">{supportViewAll()}</a>
            <button type="button" className="support-widget-close" title={actionClose()} onClick={onClose}>
                &times;
            </button>
        </div>
    </div>
);
