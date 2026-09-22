import * as React from 'react';
import {I18nForeground as t} from '../../../../../I18nGen/I18nForeground';
import {UserLink} from '@common/Components/UserPreviewModal/UserLink';
import {appUrl} from '@common/Utils/Url/appUrl';
import {ExpertInfo} from '../../types';

export const SlotExpertBlock: React.FC<{expertId: number; expert: ExpertInfo}> = ({expertId, expert}) => (
    <div className="px-3 py-2 rounded-lg border border-default" data-test-id="slot-detail-expert">
        <div className="text-sm text-muted mb-1">{t.Slot_Expert()}</div>
        <div className="flex items-center justify-between">
            <span data-test-id="slot-detail-expert-link">
                <UserLink id={expertId} name={expert.display_name} isExpert className="text-accent hover:underline font-medium" />
            </span>
            <a
                href={appUrl(`/im/#to=${expertId}`)}
                className="text-sm text-accent hover:underline"
                data-test-id="slot-detail-message-expert"
            >
                {t.Im_GoToDialogs()}
            </a>
        </div>
    </div>
);
