import * as React from 'react';
import {AntiHookComponent} from '@react-carburetor/core';
import {PreviewContext, type PreviewCtx} from '@common/Components/UserPreviewModal/PreviewContext';
import {appUrl} from '@common/Utils/Url/appUrl';
import {classAttr} from './entityLinkHelpers';

/** Simple user link for public pages — links to /expert/id~ or /user/id~ */
type LinkProps = {id: number; name: string; hasExpertProfile?: boolean; className?: string};
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
        const {id, name, hasExpertProfile, className = ''} = this.props;
        if (!id || !name) return <span {...classAttr('', className)}>{name || '—'}</span>;
        const url = appUrl(hasExpertProfile ? `/expert/id~${id}` : `/user/id~${id}`);
        const attrs = classAttr('entity-person-link', className);
        return <a {...attrs} href={url} onClick={this.onClick}>{name}</a>;
    }
}

export function UserLink(props: LinkProps) {
    return <PreviewContext.Consumer>{ctx => <LinkView {...props} openPreview={ctx.openPreview} />}</PreviewContext.Consumer>;
}
