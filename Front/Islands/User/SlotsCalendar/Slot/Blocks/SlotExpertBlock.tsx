import * as React from 'react';
import {I18nForeground as t} from '../../../../../I18nGen/I18nForeground';
import {UserLink} from '@common/Components/UserPreviewModal/UserLink';
import {appUrl} from '@common/Utils/Url/appUrl';
import {ExpertInfo} from '../../State/types';

export const SlotExpertBlock: React.FC<{expertId: number; expert: ExpertInfo}> = ({expertId, expert}) => (
    <div className="slot-detail-expert-panel" data-test-id="slot-detail-expert">
        <div className="slot-detail-label">{t.Slot_Expert()}</div>
        <div className="slot-detail-expert-row">
            <span data-test-id="slot-detail-expert-link">
                <UserLink id={expertId} name={expert.display_name} isExpert className="slot-detail-expert-link" />
            </span>
            <a
                href={appUrl(`/im/#to=${expertId}`)}
                className="slot-detail-message-link"
                data-test-id="slot-detail-message-expert"
            >
                {t.Im_GoToDialogs()}
            </a>
        </div>
    </div>
);
