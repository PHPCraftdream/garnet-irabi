import * as React from 'react';
import {AntiHookComponent, Carburetor} from '@react-carburetor/core';
import {I18nForeground as t} from '../../../../I18nGen/I18nForeground';
import type {AutoContext} from '../../../Comms/Support/parts/supportTypes';
import {formatTs} from '@common/Utils/Time/DateUtils';

interface Props {
    context: AutoContext;
}

interface Issue {
    time: number;
    text: string;
}

function renderIssue(issue: Issue) {
    return <li key={issue.time}>{issue.text}</li>;
}

function ContextIssues({label, tone, items}: {label: string; tone: 'error' | 'warning'; items: Issue[]}) {
    return (
        <div>
            <span className="admin-support-context-issue" data-tone={tone}>{label} ({items.length}):</span>
            <ul className="admin-support-context-issues" data-tone={tone}>{items.slice(0, 5).map(renderIssue)}</ul>
        </div>
    );
}

function renderBreadcrumb(item: {url: string; time: number}) {
    return <div key={item.time}>{formatTs(item.time / 1000)} {'→'} {item.url}</div>;
}

function ContextBreadcrumb({items}: {items: {url: string; time: number}[]}) {
    return (
        <div>
            <span className="admin-support-history-party">{t.Support_Context_Breadcrumb()}:</span>
            <div className="admin-support-context-breadcrumb">{items.map(renderBreadcrumb)}</div>
        </div>
    );
}

function jsIssue(error: {time: number; message: string}): Issue {
    return {time: error.time, text: error.message};
}

function networkIssue(error: {time: number; status: number; url: string}): Issue {
    return {time: error.time, text: `${error.status} ${error.url}`};
}

function ContextPanel({context}: Props) {
    return (
        <div className="admin-support-context-panel" data-test-id="support-context-panel">
            <div><span className="admin-support-history-party">{t.Support_Context_URL()}:</span> <code className="admin-support-context-value">{context.url}</code></div>
            <div><span className="admin-support-history-party">{t.Support_Context_Browser()}:</span> <span className="admin-support-context-value">{context.userAgent?.substring(0, 80)}</span></div>
            <div><span className="admin-support-history-party">{t.Support_Context_Viewport()}:</span> {context.viewport?.width}{'×'}{context.viewport?.height}</div>
            {context.jsErrors?.length > 0 && <ContextIssues label={t.Support_Context_JsErrors()} tone="error" items={context.jsErrors.map(jsIssue)} />}
            {context.netErrors?.length > 0 && <ContextIssues label={t.Support_Context_NetErrors()} tone="warning" items={context.netErrors.map(networkIssue)} />}
            {context.breadcrumb?.length > 0 && <ContextBreadcrumb items={context.breadcrumb} />}
        </div>
    );
}

export default class TicketContext extends AntiHookComponent<Props> {
    private readonly ui = new Carburetor({open: false});
    private readonly toggle = () => this.ui.setData({open: !this.ui.getData().open});

    render() {
        const {open} = this.useCarburetor(this.ui);
        return (
            <div className="admin-support-form">
                <button type="button" className="admin-support-history-toggle" onClick={this.toggle} aria-expanded={open} data-test-id="support-context-toggle">
                    <span className="admin-support-history-chevron">{open ? '▾' : '▸'}</span>
                    {t.Support_Context()}
                </button>
                {open && <ContextPanel context={this.props.context} />}
            </div>
        );
    }
}
