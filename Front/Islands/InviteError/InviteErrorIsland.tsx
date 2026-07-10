import * as React from 'react';
import {I18nForeground as t} from '../../I18nGen/I18nForeground';

interface SupportContacts {
    email: string;
    phone: string;
    telegram: string;
}

interface Props {
    title: string;
    reason: string;
    contactMessage: string;
    supportContacts: SupportContacts;
}

export const InviteErrorIsland: React.FC<Props> = ({title, reason, contactMessage, supportContacts}) => {
    const hasContacts = supportContacts.email || supportContacts.phone || supportContacts.telegram;

    return (
        <div className="max-w-lg mx-auto mt-12">
            <div className="rounded-lg border border-default bg-surface p-8 text-center">
                <div className="mb-4 text-4xl text-warning" aria-hidden="true">!</div>
                <h1 className="text-xl font-semibold text-on-surface mb-3">{title}</h1>
                <p className="text-secondary mb-6">{reason}</p>

                {hasContacts && (
                    <div className="border-t border-subtle pt-5">
                        <p className="text-sm text-secondary mb-3">{contactMessage}</p>
                        <div className="space-y-2 text-sm">
                            {supportContacts.email && (
                                <div className="text-on-surface">
                                    <span className="text-muted">Email: </span>
                                    <a href={`mailto:${supportContacts.email}`} className="text-accent hover:underline">
                                        {supportContacts.email}
                                    </a>
                                </div>
                            )}
                            {supportContacts.phone && (
                                <div className="text-on-surface">
                                    <span className="text-muted">{t.Invite_Contact_Phone()}: </span>
                                    <a href={`tel:${supportContacts.phone}`} className="text-accent hover:underline">
                                        {supportContacts.phone}
                                    </a>
                                </div>
                            )}
                            {supportContacts.telegram && (
                                <div className="text-on-surface">
                                    <span className="text-muted">Telegram: </span>
                                    <a
                                        href={supportContacts.telegram.startsWith('http') ? supportContacts.telegram : `https://t.me/${supportContacts.telegram.replace('@', '')}`}
                                        className="text-accent hover:underline"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                    >
                                        {supportContacts.telegram}
                                    </a>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
