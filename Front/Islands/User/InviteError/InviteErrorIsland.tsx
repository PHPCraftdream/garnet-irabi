import * as React from 'react';
import {I18nForeground as t} from '../../../I18nGen/I18nForeground';

const inviteContactPhone = t.Invite_Contact_Phone;

interface SupportContacts {
    email: string;
    phone: string;
    telegram: string;
}

interface Props {
    title: string;
    reason: string;
    /**
     * Что человеку делать дальше. Показывается всегда и потому обязано быть
     * самодостаточным: раньше единственная подсказка жила внутри блока
     * контактов, и на установке без заполненных контактов поддержки человек
     * узнавал, что ссылка мертва, но не узнавал, что с этим делать.
     */
    guidance?: string;
    /** Приглашение к контактам — только вместе с самими контактами. */
    contactMessage: string;
    supportContacts: SupportContacts;
}

const ContactLine: React.FC<{
    label: string;
    href: string;
    text: string;
    external?: boolean;
}> = ({label, href, text, external = false}) => (
    <div className="invite-foreground">
        <span className="invite-muted">{label}: </span>
        <a
            href={href}
            className="invite-contact-link"
            {...(external
                ? {target: '_blank', rel: 'noopener noreferrer'}
                : {})}
        >
            {text}
        </a>
    </div>
);

/** Ссылка на Telegram приходит и как адрес, и как @имя. */
const telegramHref = (value: string): string =>
    value.startsWith('http') ? value : `https://t.me/${value.replace('@', '')}`;

const SupportBlock: React.FC<{
    contacts: SupportContacts;
    message: string;
}> = ({contacts, message}) => {
    if (!contacts.email && !contacts.phone && !contacts.telegram) return null;

    return (
        <div className="invite-support">
            <p className="invite-contact-message">{message}</p>
            <div className="invite-contacts">
                {contacts.email && (
                    <ContactLine
                        label="Email"
                        href={`mailto:${contacts.email}`}
                        text={contacts.email}
                    />
                )}
                {contacts.phone && (
                    <ContactLine
                        label={inviteContactPhone()}
                        href={`tel:${contacts.phone}`}
                        text={contacts.phone}
                    />
                )}
                {contacts.telegram && (
                    <ContactLine
                        label="Telegram"
                        href={telegramHref(contacts.telegram)}
                        text={contacts.telegram}
                        external
                    />
                )}
            </div>
        </div>
    );
};

/** Приглашение не сработало: почему и что теперь делать. */
export const InviteErrorIsland: React.FC<Props> = ({
    title,
    reason,
    guidance,
    contactMessage,
    supportContacts,
}) => (
    <div className="invite-page" data-test-id="invite-error">
        <div className="invite-card">
            <div className="invite-warning" aria-hidden="true">
                !
            </div>
            <h1 className="invite-title">{title}</h1>
            <p className="invite-reason">{reason}</p>
            {guidance && <p className="invite-guidance">{guidance}</p>}
            <SupportBlock contacts={supportContacts} message={contactMessage} />
        </div>
    </div>
);
