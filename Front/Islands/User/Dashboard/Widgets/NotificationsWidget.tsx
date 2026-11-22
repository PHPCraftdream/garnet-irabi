import * as React from 'react';
import {I18nForeground as t} from '../../../../I18nGen/I18nForeground';
import {appUrl} from '@common/Utils/Url/appUrl';

interface NotificationsWidgetProps {
    unreadSupport: number;
    unreadIm: number;
}

export const NotificationsWidget: React.FC<NotificationsWidgetProps> = ({unreadSupport, unreadIm}) => {
    if (unreadSupport <= 0 && unreadIm <= 0) return null;

    return (
        <div className="dashboard-notifications" data-test-id="notifications-widget">
            {unreadSupport > 0 && (
                <a
                    href={appUrl('/support')}
                    className="dashboard-support-notification"
                >
                    {t.Dash_UnreadSupport()}: {unreadSupport}
                </a>
            )}
            {unreadIm > 0 && (
                <a
                    href={appUrl('/im')}
                    className="dashboard-message-notification"
                >
                    {t.Dash_UnreadMessages()}: {unreadIm}
                </a>
            )}
        </div>
    );
};
