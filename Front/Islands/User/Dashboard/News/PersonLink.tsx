import * as React from 'react';
import {UserLink} from '@common/Components/UserPreviewModal/UserLink';

interface Props {
    id?: number;
    name: string;
    isExpert?: boolean;
}

export function PersonLink({id, name, isExpert}: Props) {
    if (!id) return <>{name}</>;
    return <UserLink id={id} name={name} isExpert={isExpert} className="news-event-link" />;
}
