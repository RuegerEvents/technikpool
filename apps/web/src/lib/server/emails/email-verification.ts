import { renderButton, renderEmailLayout } from './layout';

export function emailVerificationEmail(opts: { name?: string | null; url: string }) {
	const greeting = opts.name ? `Hallo ${opts.name},` : 'Hallo,';

	const html = renderEmailLayout({
		preheader: 'Bestätige deine E-Mail-Adresse für Technikpool.',
		bodyHtml: `
			<p style="margin:0 0 16px">${greeting}</p>
			<p style="margin:0 0 16px">
				bitte bestätige deine E-Mail-Adresse, um dein Technikpool-Konto vollständig
				zu aktivieren.
			</p>
			${renderButton('E-Mail-Adresse bestätigen', opts.url)}
			<p style="margin:0;color:#71717a">
				Falls du kein Konto bei Technikpool erstellt hast, kannst du diese E-Mail
				ignorieren.
			</p>
		`
	});

	const text = [
		greeting,
		'',
		'bitte bestätige deine E-Mail-Adresse, um dein Technikpool-Konto vollständig zu aktivieren:',
		'',
		opts.url,
		'',
		'Falls du kein Konto bei Technikpool erstellt hast, kannst du diese E-Mail ignorieren.'
	].join('\n');

	return {
		subject: 'Technikpool: Bestätige deine E-Mail-Adresse',
		html,
		text
	};
}
