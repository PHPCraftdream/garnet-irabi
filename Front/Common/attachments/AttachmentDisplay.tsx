import * as React from 'react';
import {AntiHookComponent, Carburetor} from '@react-carburetor/core';
import type {SupportAttachment} from '../../Islands/Comms/Support/parts/supportTypes';
import ImageLightbox from '../media/ImageLightbox';
import {formatSize} from './attachmentHelpers';

interface Props {
    attachments: SupportAttachment[];
}

const FileGlyph: React.FC = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
        <polyline points="14,2 14,8 20,8" />
    </svg>
);

interface ItemProps {
    att: SupportAttachment;
    onOpen: (att: SupportAttachment) => void;
}

function renderFile(att: SupportAttachment) {
    return (
        <a
            href={att.download_url}
            target="_blank"
            rel="noopener noreferrer"
            className="attachment-file-link"
            data-test-id={`attachment-${att.id}`}
            title={att.original_name}
        >
            <div className="attachment-file-content">
                <FileGlyph />
                {/* Имя обрезано, чтобы влезть; наведение должно показывать остальное. */}
                <span className="attachment-file-name" title={att.original_name}>{att.original_name}</span>
                <span className="attachment-file-size">{formatSize(att.size)}</span>
            </div>
        </a>
    );
}

/** Картинка открывается просмотром, остальное скачивается по ссылке. */
class AttachmentItem extends AntiHookComponent<ItemProps> {
    private readonly open = () => this.props.onOpen(this.props.att);

    public render() {
        const {att} = this.props;
        if (att.mime_type.startsWith('image/')) {
            return (
                <button
                    type="button"
                    onClick={this.open}
                    className="attachment-image-button"
                    data-test-id={`attachment-${att.id}`}
                    aria-label={att.original_name}
                >
                    <img src={att.download_url} alt={att.original_name} className="attachment-image" loading="lazy" />
                </button>
            );
        }

        return renderFile(att);
    }
}

/** Вложения сообщения. */
export default class AttachmentDisplay extends AntiHookComponent<Props> {
    private readonly lightboxState = new Carburetor<{open: boolean; url: string; name: string}>({
        open: false,
        url: '',
        name: '',
    });

    private readonly open = (attachment: SupportAttachment) => this.lightboxState.setData({
        open: true,
        url: attachment.download_url,
        name: attachment.original_name,
    });
    private readonly close = () => this.lightboxState.setData({open: false, url: '', name: ''});
    private readonly renderItem = (att: SupportAttachment) => <AttachmentItem key={att.id} att={att} onOpen={this.open} />;

    public render() {
        const {attachments} = this.props;
        const {open, url, name} = this.useCarburetor(this.lightboxState);
        if (!attachments || attachments.length === 0) return null;

        return (
            <>
                <div className="attachment-list">
                    {attachments.map(this.renderItem)}
                </div>
                {open && (
                    <ImageLightbox
                        src={url}
                        alt={name}
                        downloadUrl={url}
                        downloadName={name}
                        onClose={this.close}
                    />
                )}
            </>
        );
    }
}
