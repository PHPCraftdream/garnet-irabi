import * as React from 'react';
import {useState} from 'react';
import {FormBuilder} from '@common/Components/Form/FormBuilder';
import {IDetailsInfo} from '@common/Dom/GridTable/Models';
import {goTo} from '@common/Dom/Nav/GoTo';
import {I18nFramework as I18n} from '@framework/I18nGen/I18nFramework';
import {I18nForeground as tf} from '../../I18nGen/I18nForeground';
import {sendPost} from '@common/Api/sendPost';
import {showToast} from '@common/Components/GlobalToast';
import {renderMarkdownLinks} from '@common/Utils/staticPageUrl';

interface NotifPrefsState {
	messages: string;
	support: string;
	bookings: string;
}

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

const NOTIF_CATS: (keyof NotifPrefsState)[] = ['messages', 'support', 'bookings'];

const catLabel = (cat: keyof NotifPrefsState): string => {
	if (cat === 'messages') return tf.NotifPrefs_Messages();
	if (cat === 'support') return tf.NotifPrefs_Support();
	return tf.NotifPrefs_Bookings();
};

interface NotificationPrefsProps {
	initialPrefs: NotifPrefsState;
	saveUrl: string;
	initialMarketingConsent: boolean;
}

const NotificationPrefs: React.FC<NotificationPrefsProps> = ({initialPrefs, saveUrl, initialMarketingConsent}) => {
	const [prefs, setPrefs] = useState<NotifPrefsState>({
		messages: initialPrefs.messages || 'each',
		support: initialPrefs.support || 'each',
		bookings: initialPrefs.bookings || 'each',
	});
	const [mkConsent, setMkConsent] = useState<boolean>(Boolean(initialMarketingConsent));

	// Every save carries BOTH the per-category prefs and the marketing-consent
	// toggle. The backend compares consent_marketing against the current
	// hasConsentMarketing() and journals ONLY on a real state change, so this
	// re-send on every pref tweak does not duplicate audit rows.
	const save = async (next: NotifPrefsState, nextMk: boolean): Promise<void> => {
		try {
			await sendPost(saveUrl, {
				...next,
				consent_marketing: nextMk ? '1' : '0',
			});
			showToast(tf.NotifPrefs_Saved(), 'success');
		} catch {
			showToast(tf.General_Error(), 'danger');
		}
	};

	const handleEnable = (cat: keyof NotifPrefsState, checked: boolean): void => {
		const next = {...prefs, [cat]: checked ? 'each' : 'off'};
		setPrefs(next);
		void save(next, mkConsent);
	};

	const handleFreq = (cat: keyof NotifPrefsState, value: string): void => {
		const next = {...prefs, [cat]: value};
		setPrefs(next);
		void save(next, mkConsent);
	};

	const handleMarketing = (checked: boolean): void => {
		setMkConsent(checked);
		void save(prefs, checked);
	};

	return (
		<div className="section-soft mt-6" data-test-id="notif-prefs">
			<h2 className="mb-4 text-on-surface">{tf.NotifPrefs_Title()}</h2>
			{NOTIF_CATS.map((cat) => {
				const val = prefs[cat];
				const enabled = val !== 'off';
				return (
					<div key={cat} className="mb-3 d-flex align-items-center gap-3" data-test-id={`notif-row-${cat}`}>
						<label className="form-label mb-0" style={{minWidth: '12rem'}}>{catLabel(cat)}</label>
						<input
							type="checkbox"
							checked={enabled}
							onChange={(e) => handleEnable(cat, e.currentTarget.checked)}
							data-test-id={`notif-enable-${cat}`}
						/>
						<select
							className="form-select w-auto"
							value={enabled ? val : 'each'}
							disabled={!enabled}
							onChange={(e) => handleFreq(cat, e.currentTarget.value)}
							data-test-id={`notif-freq-${cat}`}
						>
							<option value="each">{tf.NotifFreq_Each()}</option>
							<option value="hourly">{tf.NotifFreq_Hourly()}</option>
							<option value="daily">{tf.NotifFreq_Daily()}</option>
						</select>
					</div>
				);
			})}
			{/* Marketing consent is a SEPARATE concern from the transactional
			    categories above: it governs advertising mailings (none exist
			    yet), not booking/message/support notifications. Lives on the
			    account as consent_marketing_at, not in email_notif_prefs. */}
			<div className="mt-4 pt-3 border-top" data-test-id="notif-row-marketing">
				<label className="auth-consent-row flex items-start gap-2">
					<input
						type="checkbox"
						checked={mkConsent}
						onChange={(e) => handleMarketing(e.currentTarget.checked)}
						data-test-id="notif-marketing-consent"
						className="mt-1"
					/>
					<span>{I18n.Consent_Marketing()}</span>
				</label>
			</div>
		</div>
	);
};

const renderConsentPd = (): string => renderMarkdownLinks(I18n.Consent_PD());

export const RegistrationFormIsland: React.FC<RegistrationFormProps> = ({
	detailsInfo,
	details,
	action,
	formTitle,
	profileUrl,
	notifPrefs,
	notifSaveUrl,
	marketingConsent,
}) => {
	const formDetailInfo = {...detailsInfo, saveUrl: window.location.href};
	// Consent gating is for first-time REGISTRATION only — not for editing an
	// existing profile (the user already consented when they registered).
	const isRegistration = action === 'reg_user';
	const [pdConsent, setPdConsent] = useState(false);
	const [mkConsent, setMkConsent] = useState(false);
	const [consentError, setConsentError] = useState('');

	const defaultValues: Record<string, string> = {
		...(action ? {action} : {}),
		...(pdConsent ? {consent_pd: '1'} : {}),
		...(mkConsent ? {consent_marketing: '1'} : {}),
	};

	// Block submission until the (required) personal-data consent is checked.
	const beforeSubmit = (): boolean => {
		if (!pdConsent) {
			setConsentError(I18n.Consent_PD_Required());
			return false;
		}
		setConsentError('');
		return true;
	};

	// Consent checkboxes live INSIDE the form (rendered via FormBuilder's footer
	// slot) so they sit with the rest of the fields and gate the submit button.
	const consentFooter = (
		<div className="reg-consent-block space-y-3 mb-4" data-test-id="reg-consent-block">
			<label className="auth-consent-row flex items-start gap-2">
				<input
					type="checkbox"
					checked={pdConsent}
					onChange={(e) => {
						setPdConsent(e.currentTarget.checked);
						if (e.currentTarget.checked) setConsentError('');
					}}
					data-test-id="reg-consent-pd"
					className="mt-1"
				/>
				<span dangerouslySetInnerHTML={{__html: renderConsentPd()}} />
			</label>
			<label className="auth-consent-row flex items-start gap-2">
				<input
					type="checkbox"
					checked={mkConsent}
					onChange={(e) => setMkConsent(e.currentTarget.checked)}
					data-test-id="reg-consent-marketing"
					className="mt-1"
				/>
				<span>{I18n.Consent_Marketing()}</span>
			</label>
			{consentError && (
				<div className="text-danger small fs-7" data-test-id="reg-consent-error">{consentError}</div>
			)}
		</div>
	);

	return (
		<div className="page-narrow" data-test-id="registration-form">
			<div className="flex items-center justify-between gap-3 mb-6">
				<h1 className="mb-0 text-on-surface">{formTitle || I18n.Reg_Title()}</h1>
				{!isRegistration && profileUrl && (
					<a
						href={profileUrl}
						className="common-link whitespace-nowrap"
						data-test-id="profile-my-profile-link"
					>
						{tf.Profile_MyProfile()}
					</a>
				)}
			</div>
			<div className="registration-form-card">
				<FormBuilder
					detailsInfo={formDetailInfo}
					data={details}
					defaultValues={defaultValues}
					footer={isRegistration ? consentFooter : undefined}
					beforeSubmit={isRegistration ? beforeSubmit : undefined}
					onSuccess={() => goTo(window.location.href)}
				/>
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
};
