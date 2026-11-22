import * as React from 'react';
import {AntiHookComponent} from '@react-carburetor/core';
import {D} from '@common/Support/Debug/D';

interface Props {
    unreadCount: number;
    pageUrl: string;
}

// `.hot-click` — маркер навигации фреймворка (classClick), а не стилизация,
// поэтому вешается на узел при каждом его монтировании.
function attachHotClick(node: HTMLAnchorElement | null): void {
    if (node) node.classList.add('hot-click');
}

/**
 * Floating IM badge — shows unread message count.
 * Positioned to the left of the support widget.
 * Click navigates to the IM page.
 */
export class ImWidgetIsland extends AntiHookComponent<Props> {
    private readonly badge = this.props.unreadCount;

    componentDidMount(): void {
        super.componentDidMount();
        D('im.widget', {unreadCount: this.badge});
    }

    render() {
        const {pageUrl} = this.props;
        const {badge} = this;
        return (
            <a ref={attachHotClick}
                className="im-page-fab"
                href={pageUrl}
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
    }
}
