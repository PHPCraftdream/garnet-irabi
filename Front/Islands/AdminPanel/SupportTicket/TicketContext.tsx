import * as React from 'react';
import {useState} from 'react';
import {I18nForeground as t} from '../../../I18nGen/I18nForeground';
import {AutoContext} from '../../Support/supportTypes';
import {formatTs} from '@common/Utils/DateUtils';

interface Props {
    context: AutoContext;
}

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
                    {context.jsErrors?.length > 0 && (
                        <div>
                            <span className="text-danger font-medium">{t.Support_Context_JsErrors()} ({context.jsErrors.length}):</span>
                            <ul className="list-disc ml-4 text-xs text-danger">
                                {context.jsErrors.slice(0, 5).map((e, i) => <li key={i}>{e.message}</li>)}
                            </ul>
                        </div>
                    )}
                    {context.netErrors?.length > 0 && (
                        <div>
                            <span className="text-warning font-medium">{t.Support_Context_NetErrors()} ({context.netErrors.length}):</span>
                            <ul className="list-disc ml-4 text-xs text-warning">
                                {context.netErrors.slice(0, 5).map((e, i) => <li key={i}>{e.status} {e.url}</li>)}
                            </ul>
                        </div>
                    )}
                    {context.breadcrumb?.length > 0 && (
                        <div>
                            <span className="text-muted">{t.Support_Context_Breadcrumb()}:</span>
                            <div className="text-xs text-secondary mt-1">
                                {context.breadcrumb.map((b, i) => <div key={i}>{formatTs(b.time / 1000)} {'\u2192'} {b.url}</div>)}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
