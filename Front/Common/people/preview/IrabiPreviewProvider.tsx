import * as React from 'react';
import {AntiHookComponent} from '@react-carburetor/core';
import {PreviewProvider} from '@common/Components/UserPreviewModal/PreviewProvider';
import {I18nForeground as t} from '@/I18nGen/I18nForeground';
import QuickChat from '@/Common/people/chat/QuickChat';

interface Props {
    children: React.ReactNode;
    currentAccountId?: number;
}

/**
 * Thin wrapper that supplies localized labels to the generic PreviewProvider.
 * Wrap any foreground island root with this to enable inline user preview
 * modals when EntityLink / UserLink are clicked. When currentAccountId is
 * resolved (prop or window.__GARNET_ACCOUNT_ID__), the modal also renders
 * a QuickChat with the previewed user.
 */
export class IrabiPreviewProvider extends AntiHookComponent<Props> {
    private readonly labels = {
        title: t.Preview_UserTitle(),
        loading: t.Preview_Loading(),
        openProfile: t.Preview_OpenProfile(),
        sendMessage: t.Preview_SendMessage(),
        specialization: t.Preview_Specialization(),
        bio: t.Preview_Bio(),
        rating: t.Preview_Rating(),
        conducted: t.Preview_Conducted(),
        totalBookings: t.Preview_TotalBookings(),
        cancellations: t.Preview_Cancellations(),
        completedBookings: t.Preview_CompletedBookings(),
        roleExpert: t.Preview_RoleExpert(),
        roleUser: t.Preview_RoleUser(),
        close: t.Action_Close(),
        loadError: t.User_LoadError(),
    };

    /** Возвращает текущий идентификатор учётной записи. */
    private currentAccountId(): number {
        return this.props.currentAccountId
            ?? (window as unknown as {__GARNET_ACCOUNT_ID__?: number}).__GARNET_ACCOUNT_ID__
            ?? 0;
    }

    /** Создаёт чат с пользователем предпросмотра. */
    private readonly renderChat = (userId: number) => (
        <QuickChat
            partnerId={userId}
            quickChatUrl="/im/~quickChat"
            sendUrl="/im/~send"
            currentAccountId={this.currentAccountId()}
        />
    );

    /** Оборачивает содержимое провайдером предпросмотра пользователя. */
    render() {
        return (
            <PreviewProvider labels={this.labels} extraSection={this.currentAccountId() ? this.renderChat : undefined}>
                {this.props.children}
            </PreviewProvider>
        );
    }
}
