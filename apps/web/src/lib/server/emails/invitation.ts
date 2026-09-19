import { renderButton, renderEmailLayout } from './layout';

const roleLabels: Record<string, string> = {
	OWNER: 'Inhaber',
	ADMIN: 'Admin',
	MEMBER: 'Mitglied',
	VIEWER: 'Betrachter',
	DEVICE_VIEWER: 'Geräte-Betrachter'
};

export function invitationEmail(opts: {
	invitedByName?: string | null;
	orgName?: string | null;
	role?: string | null;
	url: string;
	expiresAt: Date;
}) {
	const inviter = opts.invitedByName ? `${opts.invitedByName} hat dich` : 'Du wurdest';
	const roleLabel = opts.role ? (roleLabels[opts.role] ?? opts.role) : null;
	const expires = opts.expiresAt.toLocaleDateString('de-DE');

	const intoHtml = opts.orgName
		? ` in die Organisation <strong>${opts.orgName}</strong>${roleLabel ? ` als <strong>${roleLabel}</strong>` : ''}`
		: '';
	const intoText = opts.orgName
		? ` in die Organisation "${opts.orgName}"${roleLabel ? ` als ${roleLabel}` : ''}`
		: '';

	const html = renderEmailLayout({
		preheader: 'Du wurdest zu Technikpool eingeladen.',
		bodyHtml: `
			<p style="margin:0 0 16px">Hallo,</p>
			<p style="margin:0 0 16px">
				${inviter} zu Technikpool${intoHtml} eingeladen. Über den folgenden Link legst du
				dein Konto an.
			</p>
			${renderButton('Konto anlegen', opts.url)}
			<p style="margin:0;color:#71717a">
				Der Link gilt bis zum ${expires} und nur für diese E-Mail-Adresse. Falls du die
				Einladung nicht erwartet hast, kannst du diese E-Mail ignorieren.
			</p>
		`
	});

	const text = [
		'Hallo,',
		'',
		`${inviter} zu Technikpool${intoText} eingeladen. Über den folgenden Link legst du dein Konto an:`,
		'',
		opts.url,
		'',
		`Der Link gilt bis zum ${expires} und nur für diese E-Mail-Adresse. Falls du die Einladung nicht erwartet hast, kannst du diese E-Mail ignorieren.`
	].join('\n');

	return {
		subject: opts.orgName
			? `Technikpool: Einladung zu "${opts.orgName}"`
			: 'Technikpool: Deine Einladung',
		html,
		text
	};
}
