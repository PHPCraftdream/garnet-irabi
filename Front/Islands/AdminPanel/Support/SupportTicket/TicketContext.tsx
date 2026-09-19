import * as React from 'react';
import {useState} from 'react';
import {I18nForeground as t} from '../../../../I18nGen/I18nForeground';
import {AutoContext} from '../../../Comms/Support/parts/supportTypes';
import {formatTs} from '@common/Utils/Time/DateUtils';

interface Props {
    context: AutoContext;
}

const ContextIssues: React.FC<{
    label: string;
    tone: string;
    items: {time: number; text: string}[];
}> = ({label, tone, items}) => (
    <div>
        <span className={`${tone} font-medium`}>{label} ({items.length}):</span>
        <ul className={`list-disc ml-4 text-xs ${tone}`}>
            {items.slice(0, 5).map(e => <li key={e.time}>{e.text}</li>)}
        </ul>
    </div>
);

const ContextBreadcrumb: React.FC<{
    items: {url: string; time: number}[];
}> = ({items}) => (
    <div>
        <span className="text-muted">{t.Support_Context_Breadcrumb()}:</span>
        <div className="text-xs text-secondary mt-1">
            {items.map(b => <div key={b.time}>{formatTs(b.time / 1000)} {'\u2192'} {b.url}</div>)}
        </div>
    </div>
);

export default function TicketContext({context}: Props) {
    const [showContext, setShowContext] = useState(false);

    return (
        <div className="mb-4">
            <button
                type="button"
                className="text-sm text-muted hover:text-secondary flex items-center gap-1"
                onClick={() => setShowContext(!showContext)}
                data-test-id="support-context-toggle"
            >
                <span className="text-xs select-none">{showContext ? '\u25BE' : '\u25B8'}</span>
                {t.Support_Context()}
            </button>
            {showContext && (
                <div className="mt-2 bg-surface-alt rounded border border-default p-3 text-sm space-y-1" data-test-id="support-context-panel">
                    <div><span className="text-muted">{t.Support_Context_URL()}:</span> <code className="text-xs">{context.url}</code></div>
                    <div><span className="text-muted">{t.Support_Context_Browser()}:</span> <span className="text-xs">{context.userAgent?.substring(0, 80)}</span></div>
                    <div><span className="text-muted">{t.Support_Context_Viewport()}:</span> {context.viewport?.width}{'\u00D7'}{context.viewport?.height}</div>
                    {context.jsErrors?.length > 0 && <ContextIssues label={t.Support_Context_JsErrors()} tone="text-danger" items={context.jsErrors.map(e => ({time: e.time, text: e.message}))} />}
                    {context.netErrors?.length > 0 && <ContextIssues label={t.Support_Context_NetErrors()} tone="text-warning" items={context.netErrors.map(e => ({time: e.time, text: `${e.status} ${e.url}`}))} />}
                    {context.breadcrumb?.length > 0 && <ContextBreadcrumb items={context.breadcrumb} />}
                </div>
            )}
        </div>
    );
}
