import * as React from 'react';
import {I18nForeground as t} from '../../../I18nGen/I18nForeground';

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

const ContactLine: React.FC<{label: string; href: string; text: string; external?: boolean}> = ({
    label,
    href,
    text,
    external = false,
}) => (
    <div className="text-on-surface">
        <span className="text-muted">{label}: </span>
        <a
            href={href}
            className="text-accent hover:underline"
            {...(external ? {target: '_blank', rel: 'noopener noreferrer'} : {})}
        >
            {text}
        </a>
    </div>
);

/** Ссылка на Telegram приходит и как адрес, и как @имя. */
const telegramHref = (value: string): string =>
    value.startsWith('http') ? value : `https://t.me/${value.replace('@', '')}`;

const SupportBlock: React.FC<{contacts: SupportContacts; message: string}> = ({contacts, message}) => {
    if (!contacts.email && !contacts.phone && !contacts.telegram) return null;

    return (
        <div className="border-t border-subtle pt-5">
            <p className="text-sm text-secondary mb-3">{message}</p>
            <div className="space-y-2 text-sm">
                {contacts.email && <ContactLine label="Email" href={`mailto:${contacts.email}`} text={contacts.email} />}
                {contacts.phone && (
                    <ContactLine label={t.Invite_Contact_Phone()} href={`tel:${contacts.phone}`} text={contacts.phone} />
                )}
                {contacts.telegram && (
                    <ContactLine label="Telegram" href={telegramHref(contacts.telegram)} text={contacts.telegram} external />
                )}
            </div>
        </div>
    );
};

/** Приглашение не сработало: почему и что теперь делать. */
export const InviteErrorIsland: React.FC<Props> = ({title, reason, guidance, contactMessage, supportContacts}) => (
    <div className="max-w-lg mx-auto mt-12" data-test-id="invite-error">
        <div className="rounded-lg border border-default bg-surface p-8 text-center">
            <div className="mb-4 text-4xl text-warning" aria-hidden="true">!</div>
            <h1 className="text-xl font-semibold text-on-surface mb-3">{title}</h1>
            <p className="text-secondary mb-6">{reason}</p>
            {guidance && <p className="text-on-surface mb-6">{guidance}</p>}
            <SupportBlock contacts={supportContacts} message={contactMessage} />
        </div>
    </div>
);
