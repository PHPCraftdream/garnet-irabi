import * as React from 'react';
import {AntiHookComponent} from '@react-carburetor/core';
import {appUrl} from '@common/Utils/Url/appUrl';
import {I18nForeground as t} from '@/I18nGen/I18nForeground';

interface Props {
    slotId: number;
    onBookSlot: (slotId: number) => void;
}

export class NewsSlotLink extends AntiHookComponent<Props> {
    /** Открывает бронирование для связанного занятия. */
    private readonly book = () => this.props.onBookSlot(this.props.slotId);

    /** Выводит ссылку на занятие или кнопку бронирования. */
    public render() {
        const {slotId} = this.props;
        if (slotId <= 0) return <a href={appUrl('/slots')} className="news-event-link">{t.News_NewSlot_Link()}</a>;
        return (
            <button
                type="button"
                className="news-book-button"
                onClick={this.book}
                data-test-id={`news-book-slot-${slotId}`}
            >
                {t.News_NewSlot_Link()}
            </button>
        );
    }
}
