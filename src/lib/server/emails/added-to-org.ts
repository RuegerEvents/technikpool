import { renderButton, renderEmailLayout } from './layout';

const roleLabels: Record<string, string> = {
	OWNER: 'Inhaber',
	ADMIN: 'Admin',
	MEMBER: 'Mitglied',
	VIEWER: 'Betrachter'
};

export function addedToOrgEmail(opts: {
	name?: string | null;
	orgName: string;
	role: string;
	url: string;
}) {
	const greeting = opts.name ? `Hallo ${opts.name},` : 'Hallo,';
	const roleLabel = roleLabels[opts.role] ?? opts.role;

	const html = renderEmailLayout({
		preheader: `Du wurdest zu ${opts.orgName} auf Technikpool hinzugefügt.`,
		bodyHtml: `
			<p style="margin:0 0 16px">${greeting}</p>
			<p style="margin:0 0 16px">
				du wurdest der Organisation <strong>${opts.orgName}</strong> auf Technikpool als
				<strong>${roleLabel}</strong> hinzugefügt.
			</p>
			${renderButton('Zu Technikpool', opts.url)}
		`
	});

	const text = [
		greeting,
		'',
		`du wurdest der Organisation "${opts.orgName}" auf Technikpool als ${roleLabel} hinzugefügt.`,
		'',
		opts.url
	].join('\n');

	return {
		subject: `Technikpool: Zugang zu "${opts.orgName}"`,
		html,
		text
	};
}
