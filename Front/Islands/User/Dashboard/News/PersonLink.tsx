import * as React from 'react';
import {UserLink} from '@common/Components/UserPreviewModal/UserLink';

const NEWS_EVENT_LINK_TEMPLATE = <a className="news-event-link" />;

interface Props {
    id?: number;
    name: string;
    isExpert?: boolean;
}

export function PersonLink({id, name, isExpert}: Props) {
    if (!id) return <>{name}</>;
    return <UserLink id={id} name={name} isExpert={isExpert} anchor={NEWS_EVENT_LINK_TEMPLATE} />;
}
