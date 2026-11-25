import * as React from 'react';
import {AntiHookComponent, Carburetor} from '@react-carburetor/core';
import {FormBuilder} from '@common/Components/Form/FormBuilder';
import type {IDetailsInfo} from '@common/Dom/GridTable/Models';
import {goTo} from '@common/Dom/Nav/GoTo';
import {I18nFramework as I18n} from '@framework/I18nGen/I18nFramework';
import {I18nForeground as tf} from '../../../I18nGen/I18nForeground';
import {sendPost} from '@common/Api/Send/sendPost';
import {showToast} from '@common/Components/Feedback/GlobalToast';
import {renderMarkdownLinks} from '@common/Utils/Url/staticPageUrl';

interface NotifPrefsState {
    messages: string;
    support: string;
    bookings: string;
}

type Category = keyof NotifPrefsState;
const NOTIF_CATS: readonly Category[] = ['messages', 'support', 'bookings'];

interface RegistrationFormProps {
    detailsInfo: IDetailsInfo;
    details: Record<string, unknown>;
    action?: string;
    formTitle?: string;
    profileUrl?: string;
    notifPrefs?: NotifPrefsState;
    notifSaveUrl?: string;
    marketingConsent?: boolean;
}

/** Возвращает подпись категории настроек уведомлений. */
function categoryLabel(category: Category): string {
    if (category === 'messages') return tf.NotifPrefs_Messages();
    if (category === 'support') return tf.NotifPrefs_Support();
    return tf.NotifPrefs_Bookings();
}

interface RowProps {
    category: Category;
    value: string;
    onChange: (category: Category, value: string) => void;
}

class NotificationRow extends AntiHookComponent<RowProps> {
    /** Переключает получение уведомлений для категории. */
    private readonly enable = (event: React.ChangeEvent<HTMLInputElement>) => {
        this.props.onChange(this.props.category, event.currentTarget.checked ? 'each' : 'off');
    };

    /** Меняет периодичность уведомлений для категории. */
    private readonly changeFrequency = (event: React.ChangeEvent<HTMLSelectElement>) => {
        this.props.onChange(this.props.category, event.currentTarget.value);
    };

    /** Рисует строку настроек одной категории уведомлений. */
    render() {
        const {category, value} = this.props;
        const enabled = value !== 'off';
        return (
            <div className="registration-notif-row" data-test-id={`notif-row-${category}`}>
                <label className="registration-notif-label">{categoryLabel(category)}</label>
                <input
                    type="checkbox"
                    checked={enabled}
                    onChange={this.enable}
                    data-test-id={`notif-enable-${category}`}
                />
                <select className="registration-notif-select" value={enabled ? value : 'each'} disabled={!enabled}
                    onChange={this.changeFrequency} data-test-id={`notif-freq-${category}`}>
                    <option value="each">{tf.NotifFreq_Each()}</option>
                    <option value="hourly">{tf.NotifFreq_Hourly()}</option>
                    <option value="daily">{tf.NotifFreq_Daily()}</option>
                </select>
            </div>
        );
    }
}

interface NotificationPrefsProps {
    initialPrefs: NotifPrefsState;
    saveUrl: string;
    initialMarketingConsent: boolean;
}

class NotificationPrefs extends AntiHookComponent<NotificationPrefsProps> {
    private readonly ui = new Carburetor({
        prefs: {
            messages: this.props.initialPrefs.messages || 'each',
            support: this.props.initialPrefs.support || 'each',
            bookings: this.props.initialPrefs.bookings || 'each',
        },
        marketing: Boolean(this.props.initialMarketingConsent),
    });

    /** Сохраняет настройки уведомлений и согласие на рассылку. */
    private async save(prefs: NotifPrefsState, marketing: boolean): Promise<void> {
        try {
            await sendPost(this.props.saveUrl, {...prefs, consent_marketing: marketing ? '1' : '0'});
            showToast(tf.NotifPrefs_Saved(), 'success');
        } catch {
            showToast(tf.General_Error(), 'danger');
        }
    }

    /** Сохраняет изменение частоты уведомлений. */
    private readonly changePreference = (category: Category, value: string) => {
        const current = this.ui.getData();
        const prefs = {...current.prefs, [category]: value};
        this.ui.setData({...current, prefs});
        void this.save(prefs, current.marketing);
    };

    /** Сохраняет изменение согласия на уведомления о маркетинге. */
    private readonly changeMarketing = (event: React.ChangeEvent<HTMLInputElement>) => {
        const {prefs} = this.ui.getData();
        const marketing = event.currentTarget.checked;
        this.ui.setData({prefs, marketing});
        void this.save(prefs, marketing);
    };

    /** Создаёт строки настроек для всех категорий. */
    private renderPreferences(prefs: NotifPrefsState) {
        const rows: React.ReactNode[] = [];
        for (const category of NOTIF_CATS) {
            rows.push(
                <NotificationRow key={category} category={category} value={prefs[category]}
                    onChange={this.changePreference} />,
            );
        }
        return rows;
    }

    /** Рисует настройки уведомлений и маркетингового согласия. */
    render() {
        const {prefs, marketing} = this.useCarburetor(this.ui);
        return (
            <div className="registration-notif-section">
                <div className="section-soft" data-test-id="notif-prefs">
                    <h2 className="registration-notif-heading">{tf.NotifPrefs_Title()}</h2>
                    {this.renderPreferences(prefs)}
                    <div className="registration-marketing" data-test-id="notif-row-marketing">
                        <label className="registration-consent-row">
                            <input type="checkbox" checked={marketing} onChange={this.changeMarketing}
                                data-test-id="notif-marketing-consent" className="registration-consent-check" />
                            <span>{I18n.Consent_Marketing()}</span>
                        </label>
                    </div>
                </div>
            </div>
        );
    }
}

interface ConsentState {
    pdConsent: boolean;
    mkConsent: boolean;
    consentError: string;
}

/** Возвращает пользователя к форме после успешного сохранения. */
function reloadForm(): void {
    goTo(window.location.href);
}

export class RegistrationFormIsland extends AntiHookComponent<RegistrationFormProps> {
    private readonly ui = new Carburetor<ConsentState>({pdConsent: false, mkConsent: false, consentError: ''});

    /** Сохраняет изменение согласия на обработку персональных данных. */
    private readonly changePD = (event: React.ChangeEvent<HTMLInputElement>) => {
        const current = this.ui.getData();
        const pdConsent = event.currentTarget.checked;
        this.ui.setData({...current, pdConsent, consentError: pdConsent ? '' : current.consentError});
    };

    /** Сохраняет согласие на маркетинг в состоянии формы. */
    private readonly changeMarketing = (event: React.ChangeEvent<HTMLInputElement>) => {
        this.ui.setData({...this.ui.getData(), mkConsent: event.currentTarget.checked});
    };

    /** Проверяет обязательное согласие перед отправкой регистрации. */
    private readonly beforeSubmit = (): boolean => {
        const current = this.ui.getData();
        this.ui.setData({...current, consentError: current.pdConsent ? '' : I18n.Consent_PD_Required()});
        return current.pdConsent;
    };

    /** Рисует поля согласий и сообщение об ошибке. */
    private renderConsent({pdConsent, mkConsent, consentError}: ConsentState) {
        return (
            <div className="registration-consent-block" data-test-id="reg-consent-block">
                <label className="registration-consent-row">
                    <input type="checkbox" checked={pdConsent} onChange={this.changePD}
                        data-test-id="reg-consent-pd" className="registration-consent-check" />
                    <span dangerouslySetInnerHTML={{__html: renderMarkdownLinks(I18n.Consent_PD())}} />
                </label>
                <label className="registration-consent-row">
                    <input type="checkbox" checked={mkConsent} onChange={this.changeMarketing}
                        data-test-id="reg-consent-marketing" className="registration-consent-check" />
                    <span>{I18n.Consent_Marketing()}</span>
                </label>
                {consentError && (
                    <div className="registration-consent-error" data-test-id="reg-consent-error">
                        {consentError}
                    </div>
                )}
            </div>
        );
    }

    /** Рисует заголовок формы и ссылку на профиль при редактировании. */
    private renderHeading(isRegistration: boolean) {
        const {formTitle, profileUrl} = this.props;
        return (
            <div className="registration-heading">
                <h1 className="registration-title">{formTitle || I18n.Reg_Title()}</h1>
                {!isRegistration && profileUrl && (
                    <a href={profileUrl} className="registration-profile-link" data-test-id="profile-my-profile-link">
                        {tf.Profile_MyProfile()}
                    </a>
                )}
            </div>
        );
    }

    /** Рисует форму регистрации или редактирования профиля. */
    render() {
        const {detailsInfo, details, action, notifPrefs, notifSaveUrl, marketingConsent} = this.props;
        const consent = this.useCarburetor(this.ui);
        const isRegistration = action === 'reg_user';
        const defaultValues: Record<string, string> = {
            ...(action ? {action} : {}),
            ...(consent.pdConsent ? {consent_pd: '1'} : {}),
            ...(consent.mkConsent ? {consent_marketing: '1'} : {}),
        };
        return (
            <div className="comms-page" data-test-id="registration-form">
                {this.renderHeading(isRegistration)}
                <div className="registration-panel">
                    <FormBuilder
                        detailsInfo={{...detailsInfo, saveUrl: window.location.href}}
                        data={details}
                        defaultValues={defaultValues}
                        footer={isRegistration ? this.renderConsent(consent) : undefined}
                        beforeSubmit={isRegistration ? this.beforeSubmit : undefined} onSuccess={reloadForm} />
                </div>
                {!isRegistration && notifPrefs && notifSaveUrl && (
                    <NotificationPrefs
                        initialPrefs={notifPrefs}
                        saveUrl={notifSaveUrl}
                        initialMarketingConsent={Boolean(marketingConsent)}
                    />
                )}
            </div>
        );
    }
}
