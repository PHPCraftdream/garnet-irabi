import * as React from 'react';
import {Carburetor} from '@react-carburetor/core';
import {sendPost} from '@common/Api/Send/sendPost';
import {sendPostFormData} from '@common/Api/Send/sendPostFormData';
import {showToast} from '@common/Components/Feedback/GlobalToast';
import {D} from '@common/Support/Debug/D';
import {PendingFile} from '../../../../../Common/attachments/AttachmentPicker';
import {I18nForeground as t} from '../../../../../I18nGen/I18nForeground';
import {SupportMessage} from '../supportTypes';
import {collectContext} from './context/autoContext';
import {reportAttachmentErrors} from '../../../../../Common/attachments/helpers/reportAttachmentErrors';

export interface ThreadState {
    messages: SupportMessage[];
    loading: boolean;
}

export interface SupportThreadOptions {
    messagesUrl: string;
    createUrl: string;
    replyUrl: string;
}

/** Добавляет файлы к данным запроса. */
function appendFiles(fd: FormData, files: readonly PendingFile[]): void {
    for (const f of files) {
        fd.append('attachments[]', f.file, f.name);
    }
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
export class SupportThreadController extends Carburetor<ThreadState> {
    private readonly messagesUrl: string;
    private readonly createUrl: string;
    private readonly replyUrl: string;
    private pollTimer: number | null = null;
    private pollTicketId: number | null = null;
    private pollIntervalMs: number | null = null;

    /** Создаёт состояние контроллера. */
    constructor(options: SupportThreadOptions) {
        super({messages: [], loading: false});
        this.messagesUrl = options.messagesUrl;
        this.createUrl = options.createUrl;
        this.replyUrl = options.replyUrl;
    }

    /** Возвращает текущий снимок состояния. */
    readonly snapshot = () => this.getData();

    /** Подписывает слушателя на изменения снимка. */
    readonly subscribeSnapshot = (listener: () => void) => {
        const id = this.subscribe(listener);

        return () => this.unsubscribe(id);
    };

    /** Обновляет часть состояния. */
    private patch(changes: Partial<ThreadState>): void {
        const previous = this.getData();
        const version = this.getVersion();
        this.setData({...previous, ...changes});
        if (this.getData() !== previous && this.getVersion() === version) {
            this.markAllChanged();
            this.emitUpdate();
        }
    }

    /** Обрабатывает setMessages. */
    readonly setMessages: React.Dispatch<React.SetStateAction<SupportMessage[]>> = value => {
        const current = this.getData().messages;
        this.patch({messages: typeof value === 'function' ? value(current) : value});
    };

    /** Обрабатывает setLoading. */
    readonly setLoading = (value: boolean): void => this.patch({loading: value});

    /**
     * `silent` не зажигает спиннер — так фоновое обновление не превращает
     * открытую переписку в «Загрузка…» каждые пятнадцать секунд.
     */
    async loadMessages(ticketId: number, silent = false): Promise<any> {
        if (!silent) this.setLoading(true);
        D('support.messages', {ticketId});
        try {
            const r: any = await sendPost(this.messagesUrl, {ticket_id: ticketId});
            D('support.messages.loaded', {ticketId, count: r?.messages?.length ?? 0});
            this.setMessages(r?.messages ?? []);

            return r;
        } catch (err) {
            D('support.error', {action: 'fetchMessages', ticketId, error: err});
            if (!silent) showToast(t.User_LoadError(), 'danger');

            return null;
        } finally {
            this.setLoading(false);
        }
    }

    /** Создать обращение. Возвращает созданный тикет или null. */
    async createTicket(subject: string, message: string, files: PendingFile[]): Promise<any> {
        const context = collectContext();
        D('support.create', {subject, hasAttachments: files.length > 0});
        D('support.context', context);

        const fd = new FormData();
        fd.append('subject', subject.trim());
        fd.append('message', message.trim());
        fd.append('context', JSON.stringify(context));
        appendFiles(fd, files);

        const r = await sendPostFormData<FormData, any>(this.createUrl, fd);
        // Сообщение может быть принято, а файл на нём — отвергнут: слишком
        // большой, не тот тип. Промолчать значит оставить отправителя
        // уверенным, что файл ушёл вместе с текстом.
        reportAttachmentErrors(r);

        return r;
    }

    /** Ответить в обращение. */
    async reply(ticketId: number, text: string, files: PendingFile[]): Promise<void> {
        D('support.reply', {ticketId, hasAttachments: files.length > 0});

        const fd = new FormData();
        fd.append('ticket_id', String(ticketId));
        fd.append('message', text.trim());
        appendFiles(fd, files);

        const resp = await sendPostFormData<FormData, any>(this.replyUrl, fd);
        reportAttachmentErrors(resp);
    }

    /**
     * Обновлять открытую переписку, пока вкладка на виду.
     *
     * В свёрнутой вкладке опрос выключается: обновлять то, чего никто не
     * видит, — это только нагрузка на сервер.
     */
    startPolling(ticketId: number, intervalMs: number): void {
        // Уже заряженный тот же опрос не перезаряжаем: тик от этого не сдвигается.
        if (this.pollTimer !== null && this.pollTicketId === ticketId && this.pollIntervalMs === intervalMs) {
            return;
        }
        this.stopPolling();
        this.pollTicketId = ticketId;
        this.pollIntervalMs = intervalMs;
        this.pollTimer = window.setInterval(() => {
            if (!document.hidden) void this.loadMessages(ticketId, true);
        }, intervalMs);
    }

    /** Останавливает опрос переписки. */
    stopPolling(): void {
        if (this.pollTimer !== null) {
            window.clearInterval(this.pollTimer);
            this.pollTimer = null;
        }
        this.pollTicketId = null;
        this.pollIntervalMs = null;
    }

    /** Проверяет, освобождён ли контроллер. */
    protected didDispose(): void {
        super.didDispose();
        this.stopPolling();
    }
}
