import * as React from 'react';
import {AntiHookComponent, Carburetor} from '@react-carburetor/core';
import {I18nForeground as t} from '@/I18nGen/I18nForeground';
import type {AutoContext} from '@/Islands/Comms/Support/parts/supportTypes';
import {formatTs} from '@common/Utils/Time/DateUtils/format/formatTs';

const support_Context_Breadcrumb = t.Support_Context_Breadcrumb;
const support_Context_Browser = t.Support_Context_Browser;
const support_Context_JsErrors = t.Support_Context_JsErrors;
const support_Context_NetErrors = t.Support_Context_NetErrors;
const support_Context_URL = t.Support_Context_URL;
const support_Context_Viewport = t.Support_Context_Viewport;

interface Props {
    context: AutoContext;
}

interface Issue {
    time: number;
    text: string;
}

/** Формирует представление данных для соответствующего раздела панели. */
function renderIssue(issue: Issue) {
    return <li key={issue.time}>{issue.text}</li>;
}

/** Обеспечивает работу соответствующей части интерфейса панели администратора. */
function ContextIssues({label, tone, items}: {label: string; tone: 'error' | 'warning'; items: Issue[]}) {
    return (
        <div>
            <span className="admin-support-context-issue" data-tone={tone}>{label} ({items.length}):</span>
            <ul className="admin-support-context-issues" data-tone={tone}>{items.slice(0, 5).map(renderIssue)}</ul>
        </div>
    );
}

/** Формирует представление данных для соответствующего раздела панели. */
function renderBreadcrumb(item: {url: string; time: number}) {
    return <div key={item.time}>{formatTs(item.time / 1000)} {'→'} {item.url}</div>;
}

/** Обеспечивает работу соответствующей части интерфейса панели администратора. */
function ContextBreadcrumb({items}: {items: {url: string; time: number}[]}) {
    return (
        <div>
            <span className="admin-support-history-party">{support_Context_Breadcrumb()}:</span>
            <div className="admin-support-context-breadcrumb">{items.map(renderBreadcrumb)}</div>
        </div>
    );
}

/** Обеспечивает работу соответствующей части интерфейса панели администратора. */
function jsIssue(error: {time: number; message: string}): Issue {
    return {time: error.time, text: error.message};
}

/** Обеспечивает работу соответствующей части интерфейса панели администратора. */
function networkIssue(error: {time: number; status: number; url: string}): Issue {
    return {time: error.time, text: `${error.status} ${error.url}`};
}

/** Обеспечивает работу соответствующей части интерфейса панели администратора. */
function ContextPanel({context}: Props) {
    return (
        <div className="admin-support-context-panel" data-test-id="support-context-panel">
            <div><span className="admin-support-history-party">{support_Context_URL()}:</span> <code
                className="admin-support-context-value">{context.url}</code></div>
            <div><span className="admin-support-history-party">{support_Context_Browser()}:</span> <span
                className="admin-support-context-value">{context.userAgent?.substring(0, 80)}</span></div>
            <div>
                <span className="admin-support-history-party">{support_Context_Viewport()}:</span>{' '}
                {context.viewport?.width}{'×'}{context.viewport?.height}
            </div>
            {context.jsErrors?.length > 0 && (
                <ContextIssues
                    label={support_Context_JsErrors()}
                    tone="error"
                    items={context.jsErrors.map(jsIssue)}
                />
            )}
            {context.netErrors?.length > 0 && (
                <ContextIssues
                    label={support_Context_NetErrors()}
                    tone="warning"
                    items={context.netErrors.map(networkIssue)}
                />
            )}
            {context.breadcrumb?.length > 0 && <ContextBreadcrumb items={context.breadcrumb} />}
        </div>
    );
}

export default class TicketContext extends AntiHookComponent<Props> {
    private readonly ui = new Carburetor({open: false});
    /** Обновляет состояние интерфейса или передаёт действие пользователя обработчику. */
    private readonly toggle = () => this.ui.setData({open: !this.ui.getData().open});

    /** Формирует представление данных для соответствующего раздела панели. */
    render() {
        const {open} = this.useCarburetor(this.ui);
        return (
            <div className="admin-support-form">
                <button
                    type="button"
                    className="admin-support-history-toggle"
                    onClick={this.toggle}
                    aria-expanded={open}
                    data-test-id="support-context-toggle"
                >
                    <span className="admin-support-history-chevron">{open ? '▾' : '▸'}</span>
                    {t.Support_Context()}
                </button>
                {open && <ContextPanel context={this.props.context} />}
            </div>
        );
    }
}
