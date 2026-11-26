import * as React from 'react';
import {AntiHookComponent, type TReadonly} from '@react-carburetor/core';
import {I18nForeground as t} from '@/I18nGen/I18nForeground';
import {appUrl} from '@common/Utils/Url/appUrl';
import {formatTs} from '@common/Utils/Time/DateUtils/format/formatTs';
import {PaginationController} from '@common/hooks/data/PaginationController';
import type {PageResponse} from '@common/hooks/data/usePagination';
import Pagination, {PaginationLabels} from '@common/Components/Layout/Paging/Pagination';

const bookingNA = t.Booking_NA;

interface MyReview {
    id: number;
    expert_id: number;
    expert_name: string;
    body: string;
    moderation_status: 'pending' | 'approved' | 'rejected' | 'flagged';
    created_at: number;
}

const STATUS_LABEL: Record<MyReview['moderation_status'], () => string> = {
    pending: () => t.Comment_StatusPending(),
    approved: () => t.Comment_StatusMine(),
    rejected: () => t.Comment_StatusRejected(),
    flagged: () => t.Comment_StatusFlagged(),
};

const MyReviewItem: React.FC<{review: MyReview}> = ({review: r}) => (
    <div className="my-review-item" data-test-id={`my-review-${r.id}`}>
        <div className="my-review-item-heading">
            <a href={appUrl(`/expert/id~${r.expert_id}`)} className="my-review-expert">
                {r.expert_name || bookingNA()}
            </a>
            <span className="support-ticket-time">{STATUS_LABEL[r.moderation_status]()}</span>
        </div>
        <p className="my-review-copy">{r.body}</p>
        <span className="support-ticket-time">{formatTs(r.created_at)}</span>
    </div>
);

/** Возвращает строку отзыва для отображения. */
function renderReview(review: MyReview) {
    return <MyReviewItem key={review.id} review={review} />;
}

interface MyReviewsProps {
    listUrl: string;
    initialData?: PageResponse<MyReview>;
}

/** Копирует поля отзыва для подписки Carburetor на их изменения. */
function readReview(row: TReadonly<MyReview>): MyReview {
    return {
        id: row.id,
        expert_id: row.expert_id,
        expert_name: row.expert_name,
        body: row.body,
        moderation_status: row.moderation_status,
        created_at: row.created_at,
    };
}

/** Формирует переведённые подписи пагинации. */
function paginationLabels(): PaginationLabels {
    return {prev: t.Pagination_Prev(), next: t.Pagination_Next(), of: t.Pagination_Of(), items: t.Pagination_Items()};
}

/**
 * D-128: до этого отзывы не жили нигде, кроме страницы того эксперта, о
 * котором были написаны — ни числа, ни списка, ни ссылки на свои. Автор с
 * отзывами о трёх разных преподавателях не мог увидеть их разом.
 */
export class MyReviews extends AntiHookComponent<MyReviewsProps> {
    private readonly pagination = new PaginationController<MyReview>({
        url: this.props.listUrl,
        initialData: this.props.initialData,
    });

    /** Запускает загрузку отзывов после монтирования компонента. */
    componentDidMount(): void {
        super.componentDidMount();
        this.pagination.start();
    }

    /** Обновляет URL загрузки при смене адреса списка. */
    componentDidUpdate(previous: Readonly<MyReviewsProps>): void {
        super.componentDidUpdate(previous);
        if (this.props.listUrl !== previous.listUrl) this.pagination.setUrl(this.props.listUrl);
    }

    /** Останавливает загрузчик при размонтировании компонента. */
    componentWillUnmount(): void {
        this.pagination.dispose();
        super.componentWillUnmount();
    }

    /** Рисует панель отзывов и элементы пагинации. */
    private renderBody(rows: MyReview[], pager: {
        page: number;
        totalPages: number;
        total: number;
        loading: boolean;
        perPage: number;
    }) {
        const {page, totalPages, total, loading, perPage} = pager;
        return (
            <div className="my-reviews-panel" data-test-id="my-reviews-section">
                <div className="my-reviews-header">
                    <h3 className="my-reviews-heading">{t.MyReviews_Title()}</h3>
                    <span className="admin-client-context-empty" data-test-id="my-reviews-count">{total}</span>
                </div>

                {totalPages > 1 && (
                    <div className="my-reviews-pager">
                        <Pagination
                            page={page}
                            totalPages={totalPages}
                            total={total}
                            loading={loading}
                            compact
                            onPageChange={this.pagination.goToPage}
                            labels={paginationLabels()}
                            pageSize={perPage}
                            onPageSizeChange={this.pagination.setPerPage}
                        />
                    </div>
                )}

                <div className="my-reviews-list">
                    {rows.map(renderReview)}
                </div>
            </div>
        );
    }

    /** Отображает отзывы, полученные контроллером пагинации. */
    render() {
        const {items, page, perPage, totalPages, total, loading} = this.useCarburetor(this.pagination);
        if (!loading && total === 0) return null;
        return this.renderBody(items.map(readReview), {page, totalPages, total, loading, perPage});
    }
}
