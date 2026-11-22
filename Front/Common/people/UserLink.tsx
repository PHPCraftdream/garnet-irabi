import * as React from 'react';
import {AntiHookComponent} from '@react-carburetor/core';
import {usePreview} from '@common/Components/UserPreviewModal/PreviewContext';
import {appUrl} from '@common/Utils/Url/appUrl';

/** Simple user link for public pages — links to /expert/id~ or /user/id~ */
type LinkProps = {id: number; name: string; hasExpertProfile?: boolean; className?: string};
type ContextValue = ReturnType<typeof usePreview>['openPreview'];

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
        // Совместимость с переданным классом ссылки.
        // carburetor-disable-next-line require-function-class
        if (!id || !name) return <span className={className}>{name || '—'}</span>;
        const url = appUrl(hasExpertProfile ? `/expert/id~${id}` : `/user/id~${id}`);



        // carburetor-disable-next-line require-function-class
        return <a href={url} className={`entity-person-link ${className}`} onClick={this.onClick}>{name}</a>;
    }
}

export function UserLink(props: LinkProps) {
    const {openPreview} = usePreview();
    return <LinkView {...props} openPreview={openPreview} />;
}
