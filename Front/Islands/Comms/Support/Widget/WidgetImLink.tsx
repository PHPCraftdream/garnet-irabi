import * as React from 'react';
import {AntiHookComponent} from '@react-carburetor/core';

import {I18nForeground as t} from '../../../../I18nGen/I18nForeground';

interface ImLinkProps {
    imUnread: number;
    imPageUrl: string;
}

/**
 * Ссылка на личные сообщения; без непрочитанных не рисуется.
 *
 * `data-hot-click` — маркер навигации фреймворка, а не стилизация.
 */
export class WidgetImLink extends AntiHookComponent<ImLinkProps> {
    /** Рисует содержимое компонента. */
    render() {
        const {imUnread, imPageUrl} = this.props;
        if (imUnread <= 0) return null;

        // IM link — отдельная система (личные сообщения), не переписка
        // по тикету. Раньше подписывался просто "Сообщения" — в панели
        // поддержки, поверх переписки по тикету, это читалось как
        // "перейти к этому диалогу" (нашёл expert-3).
        return (
            <a data-hot-click href={imPageUrl} className="widget-im-link" data-test-id="widget-im-link">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect width="20" height="16" x="2" y="4" rx="2" />
                    <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                </svg>
                <span className="widget-im-label">{t.Support_Widget_ImBannerLabel()}</span>
                <span className="widget-im-unread">{imUnread}</span>
            </a>
        );
    }
}
