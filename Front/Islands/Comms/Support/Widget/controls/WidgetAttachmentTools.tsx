import * as React from 'react';
import AttachmentPicker, {PendingFile} from '../../../../../Common/attachments/AttachmentPicker';
import ScreenshotButton from '../../../../../Common/media/ScreenshotButton';

interface Props {
    files: PendingFile[];
    onFilesChange: (files: PendingFile[]) => void;
    onScreenshot: (blob: Blob, name: string) => void;
}

export const WidgetAttachmentTools: React.FC<Props> = ({files, onFilesChange, onScreenshot}) => (
    <div className="widget-attachment-tools">
        <AttachmentPicker files={files} onChange={onFilesChange} />
        <ScreenshotButton onScreenshot={onScreenshot} />
    </div>
);
