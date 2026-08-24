import { renderEmailLayout } from './layout';

export function passwordChangedEmail(opts: { name?: string | null }) {
	const greeting = opts.name ? `Hallo ${opts.name},` : 'Hallo,';

	const html = renderEmailLayout({
		preheader: 'Dein Technikpool-Passwort wurde geändert.',
		bodyHtml: `
			<p style="margin:0 0 16px">${greeting}</p>
			<p style="margin:0">
				dein Passwort für Technikpool wurde soeben geändert. Falls du das nicht warst,
				melde dich bitte umgehend bei uns.
			</p>
		`
	});

	const text = [
		greeting,
		'',
		'dein Passwort für Technikpool wurde soeben geändert. Falls du das nicht warst, melde dich bitte umgehend bei uns.'
	].join('\n');

	return {
		subject: 'Technikpool: Dein Passwort wurde geändert',
		html,
		text
	};
}
