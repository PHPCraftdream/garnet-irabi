import * as React from 'react';
import {useState, useEffect} from 'react';
import {D} from '@common/Debug/D';

interface Props {
    unreadCount: number;
    pageUrl: string;
}

/**
 * Floating IM badge — shows unread message count.
 * Positioned to the left of the support widget.
 * Click navigates to the IM page.
 */
export const ImWidgetIsland: React.FC<Props> = ({unreadCount, pageUrl}) => {
    const [badge, _setBadge] = useState(unreadCount);

    useEffect(() => {
        D('im.widget', {unreadCount});
    }, []);

    return (
        <a
            href={pageUrl}
            className="hot-click support-im-fab"
            data-test-id="im-widget-btn"
            title="Messages"
        >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect width="20" height="16" x="2" y="4" rx="2" />
                <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
            </svg>
            {badge > 0 && (
                <span
                    data-test-id="im-widget-badge"
                    className="support-fab-badge"
                >
                    {badge > 9 ? '9+' : badge}
                </span>
            )}
        </a>
    );
};
