import * as React from 'react';
import {useState, useRef, useEffect} from 'react';
import {sendPost} from '@common/Api/sendPost';
import {sendPostFormData} from '@common/Api/sendPostFormData';
import {showToast} from '@common/Components/GlobalToast';
import {D} from '@common/Debug/D';
import {PendingFile} from '../../Common/attachments/AttachmentPicker';
import {I18nForeground as t} from '../../I18nGen/I18nForeground';
import {SupportMessage} from './supportTypes';
import {collectContext} from './autoContext';
import {reportAttachmentErrors} from '../../Common/attachments/attachmentErrors';

interface Options {
    messagesUrl: string;
    createUrl: string;
    replyUrl: string;
}

/**
 * Переписка по обращению: загрузка, отправка, файлы, автопрокрутка.
 *
 * Страница поддержки и всплывающее окно — это одна и та же переписка в двух
 * обёртках, и обе несли собственную копию всего этого: своя `fetchMessages`,
 * свой опрос по таймеру, своя сборка FormData с вложениями и контекстом. Копии
 * не расходились только пока их никто не трогал.
 *
 * Что осталось у вызывающего — вид: список, разговор, форма. Он разный.
 */
export function useSupportThread({messagesUrl, createUrl, replyUrl}: Options) {
    const [messages, setMessages] = useState<SupportMessage[]>([]);
    const [loading, setLoading] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Новое сообщение должно оказаться на виду само: человек читает низ ленты,
    // а не ищет, куда она уехала.
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({behavior: 'smooth'});
    }, [messages]);

    /**
     * `silent` не зажигает спиннер — так фоновое обновление не превращает
     * открытую переписку в «Загрузка…» каждые пятнадцать секунд.
     */
    const loadMessages = React.useCallback(async (ticketId: number, silent = false): Promise<any> => {
        if (!silent) setLoading(true);
        D('support.messages', {ticketId});
        try {
            const r: any = await sendPost(messagesUrl, {ticket_id: ticketId});
            D('support.messages.loaded', {ticketId, count: r?.messages?.length ?? 0});
            setMessages(r?.messages ?? []);

            return r;
        } catch (err) {
            D('support.error', {action: 'fetchMessages', ticketId, error: err});
            if (!silent) showToast(t.User_LoadError(), 'danger');

            return null;
        } finally {
            setLoading(false);
        }
    }, [messagesUrl]);

    const appendFiles = (fd: FormData, files: PendingFile[]) => {
        for (const f of files) {
            fd.append('attachments[]', f.file, f.name);
        }
    };

    /** Создать обращение. Возвращает созданный тикет или null. */
    const createTicket = React.useCallback(async (subject: string, message: string, files: PendingFile[]): Promise<any> => {
        const context = collectContext();
        D('support.create', {subject, hasAttachments: files.length > 0});
        D('support.context', context);

        const fd = new FormData();
        fd.append('subject', subject.trim());
        fd.append('message', message.trim());
        fd.append('context', JSON.stringify(context));
        appendFiles(fd, files);

        const r = await sendPostFormData<FormData, any>(createUrl, fd);
        // Сообщение может быть принято, а файл на нём — отвергнут: слишком
        // большой, не тот тип. Промолчать значит оставить отправителя
        // уверенным, что файл ушёл вместе с текстом.
        reportAttachmentErrors(r);

        return r;
    }, [createUrl]);

    /** Ответить в обращение. */
    const reply = React.useCallback(async (ticketId: number, text: string, files: PendingFile[]): Promise<void> => {
        D('support.reply', {ticketId, hasAttachments: files.length > 0});

        const fd = new FormData();
        fd.append('ticket_id', String(ticketId));
        fd.append('message', text.trim());
        appendFiles(fd, files);

        const resp = await sendPostFormData<FormData, any>(replyUrl, fd);
        reportAttachmentErrors(resp);
    }, [replyUrl]);

    /**
     * Обновлять открытую переписку, пока вкладка на виду.
     *
     * В свёрнутой вкладке опрос выключается: обновлять то, чего никто не
     * видит, — это только нагрузка на сервер.
     */
    const usePolling = (ticketId: number | null, intervalMs: number, enabled = true) => {
        useEffect(() => {
            if (!enabled || !ticketId) return;
            const id = window.setInterval(() => {
                if (!document.hidden) void loadMessages(ticketId, true);
            }, intervalMs);

            return () => window.clearInterval(id);
        }, [ticketId, intervalMs, enabled]);
    };

    return {messages, setMessages, loading, messagesEndRef, loadMessages, createTicket, reply, usePolling};
}
