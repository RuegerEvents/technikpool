import { renderButton, renderEmailLayout } from './layout';

export function passwordResetEmail(opts: { name?: string | null; url: string }) {
	const greeting = opts.name ? `Hallo ${opts.name},` : 'Hallo,';

	const html = renderEmailLayout({
		preheader: 'Setze dein Technikpool-Passwort zurück.',
		bodyHtml: `
			<p style="margin:0 0 16px">${greeting}</p>
			<p style="margin:0 0 16px">
				wir haben eine Anfrage erhalten, dein Passwort für Technikpool zurückzusetzen.
				Klicke auf den Button unten, um ein neues Passwort zu vergeben. Der Link ist
				eine Stunde lang gültig.
			</p>
			${renderButton('Passwort zurücksetzen', opts.url)}
			<p style="margin:0;color:#71717a">
				Falls du das nicht angefordert hast, kannst du diese E-Mail ignorieren — es
				wurde nichts an deinem Konto geändert.
			</p>
		`
	});

	const text = [
		greeting,
		'',
		'wir haben eine Anfrage erhalten, dein Passwort für Technikpool zurückzusetzen.',
		'Öffne den folgenden Link, um ein neues Passwort zu vergeben (eine Stunde gültig):',
		'',
		opts.url,
		'',
		'Falls du das nicht angefordert hast, kannst du diese E-Mail ignorieren.'
	].join('\n');

	return {
		subject: 'Technikpool: Passwort zurücksetzen',
		html,
		text
	};
}
