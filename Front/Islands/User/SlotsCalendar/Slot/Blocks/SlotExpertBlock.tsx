import * as React from 'react';
import {I18nForeground as t} from '@/I18nGen/I18nForeground';
import {UserLink} from '@common/Components/UserPreviewModal/UserLink';
import {appUrl} from '@common/Utils/Url/appUrl';
import {ExpertInfo} from '@/Islands/User/SlotsCalendar/State/view/types';

const imGoToDialogs = t.Im_GoToDialogs;
const slotExpert = t.Slot_Expert;

const SLOT_DETAIL_EXPERT_LINK_TEMPLATE = <a className="slot-detail-expert-link" />;

/** Обновляет данные календаря. */
export const SlotExpertBlock: React.FC<{expertId: number; expert: ExpertInfo}> = ({expertId, expert}) => (
    <div className="slot-detail-expert-panel" data-test-id="slot-detail-expert">
        <div className="slot-detail-label">{slotExpert()}</div>
        <div className="slot-detail-expert-row">
            <span data-test-id="slot-detail-expert-link">
                <UserLink id={expertId} name={expert.display_name} isExpert anchor={SLOT_DETAIL_EXPERT_LINK_TEMPLATE} />
            </span>
            <a
                href={appUrl(`/im/#to=${expertId}`)}
                className="slot-detail-message-link"
                data-test-id="slot-detail-message-expert"
            >
                {imGoToDialogs()}
            </a>
        </div>
    </div>
);
