import * as React from 'react';
import {AntiHookComponent} from '@react-carburetor/core';
import {PreviewContext, type PreviewCtx} from '@common/Components/UserPreviewModal/PreviewContext';
import {appUrl} from '@common/Utils/Url/appUrl';

/** Simple user link for public pages — links to /expert/id~ or /user/id~ */
type LinkProps = {id: number; name: string; hasExpertProfile?: boolean};
type ContextValue = PreviewCtx['openPreview'];

class LinkView extends AntiHookComponent<LinkProps & {openPreview: ContextValue}> {
    private readonly onClick = (e: React.MouseEvent) => {
        const {openPreview, id, name} = this.props;
        e.stopPropagation();
        if (!openPreview) return;
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || (e as any).button === 1) return;
        e.preventDefault();
        openPreview(id, name);
    };

    render() {
        const {id, name, hasExpertProfile} = this.props;
        if (!id || !name) return <span>{name || '—'}</span>;
        const url = appUrl(hasExpertProfile ? `/expert/id~${id}` : `/user/id~${id}`);
        return <a className="entity-person-link" href={url} onClick={this.onClick}>{name}</a>;
    }
}

export function UserLink(props: LinkProps) {
    return <PreviewContext.Consumer>{ctx => <LinkView {...props} openPreview={ctx.openPreview} />}</PreviewContext.Consumer>;
}
