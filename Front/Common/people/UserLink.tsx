import * as React from 'react';
import {usePreview} from '@common/Components/UserPreviewModal/PreviewContext';
import {appUrl} from '@common/Utils/Url/appUrl';

/** Simple user link for public pages — links to /expert/id~ or /user/id~ */
export const UserLink: React.FC<{id: number; name: string; hasExpertProfile?: boolean; className?: string}> = ({id, name, hasExpertProfile, className = ''}) => {
    const {openPreview} = usePreview();
    if (!id || !name) return <span className={className}>{name || '—'}</span>;
    const url = appUrl(hasExpertProfile ? `/expert/id~${id}` : `/user/id~${id}`);

    const onClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!openPreview) return;
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || (e as any).button === 1) return;
        e.preventDefault();
        openPreview(id, name);
    };

    return <a href={url} className={`common-link ${className}`} onClick={onClick}>{name}</a>;
};
