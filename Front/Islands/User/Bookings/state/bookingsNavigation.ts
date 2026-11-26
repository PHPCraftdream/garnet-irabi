import {sendPost} from '@common/Api/Send/sendPost';
import {showToast} from '@common/Components/Feedback/GlobalToast';
import {DEFAULT_PAGE_SIZE} from '@common/Utils/Data/pagination/DEFAULT_PAGE_SIZE';
import {I18nForeground as t} from '@/I18nGen/I18nForeground';
import type {BookingsPageResponse} from './bookingsTabStateTypes';
import type {BookingsViewAs, StatusFilter} from '@/Islands/User/Bookings/card/bookingCardTypes';
import {BookingsStateStore} from './bookingsTabState';

export class BookingsNavigation {
    /** Связывает хранилище с URL загрузки списка броней. */
    constructor(private readonly store: BookingsStateStore, private readonly bookingsPageUrl: string) {}

    /** Запрашивает страницу с текущими фильтрами и сохраняет ответ. */
    readonly fetchPage = async (
        targetPage: number,
        opts: {status?: StatusFilter; showPast?: boolean; view?: BookingsViewAs} = {},
    ) => {
        const {store, bookingsPageUrl} = this;
        const {statusFilter, showPast, viewAs} = store.getData();
        const status = opts.status ?? statusFilter;
        const past = opts.showPast ?? showPast;
        // Вид передаётся явно: при переключении стороны состояние ещё не
        // применилось, а сервер должен отдать список уже новой стороны.
        const view = opts.view ?? viewAs;
        store.setPageLoading(true);
        try {
            const resp = await sendPost<
                {page: number; perPage: number; status: string; showPast: boolean; view: BookingsViewAs},
                BookingsPageResponse
            >(bookingsPageUrl, {
                page: targetPage,
                perPage: DEFAULT_PAGE_SIZE,
                status: status === 'all' ? '' : status,
                showPast: past,
                view,
            });
            const data = ('data' in resp && resp.data) ? resp.data : resp as unknown as BookingsPageResponse;
            store.applyPage(data);
        } catch {
            showToast(t.User_LoadError(), 'danger');
        } finally {
            store.setPageLoading(false);
        }
    };

    /** Проверяет границы пагинации перед загрузкой выбранной страницы. */
    readonly handlePageChange = (p: number) => {
        const {totalPages, page, pageLoading} = this.store.getData();
        if (p < 1 || p > totalPages || (p === page && !pageLoading)) return;
        void this.fetchPage(p);
    };

    /** Сохраняет фильтр статуса и заново загружает первую страницу. */
    readonly handleStatusChange = (s: StatusFilter) => {
        const {store} = this;
        const {statusFilter} = store.getData();
        if (s === statusFilter) return;
        store.setStatusFilter(s);
        void this.fetchPage(1, {status: s});
    };

    /** Переключает сторону списка и загружает её первую страницу. */
    readonly handleViewChange = (next: BookingsViewAs) => {
        const {store} = this;
        const {viewAs} = store.getData();
        if (next === viewAs) return;
        store.setViewAs(next);
        // Фильтр по статусу и «показать прошедшие» осмысленны на обеих
        // сторонах, поэтому сохраняются; страница сбрасывается на первую —
        // списки разной длины, и третья страница входящих ничего не значит
        // для своих занятий.
        void this.fetchPage(1, {view: next});
    };

    /** Переключает показ прошедших занятий и обновляет список. */
    readonly handleTogglePast = () => {
        const {store} = this;
        const {showPast} = store.getData();
        const next = !showPast;
        store.setShowPast(next);
        void this.fetchPage(1, {showPast: next});
    };
}
