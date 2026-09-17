import { renderButton, renderEmailLayout } from './layout';

/**
 * Goes to the address currently on the account, not the new one — confirming a
 * change at the new address would let anyone who reached an unlocked session
 * move the account somewhere its owner can't follow. The old inbox is the one
 * thing an attacker in that position does not have.
 */
export function emailChangeConfirmationEmail(opts: {
	name?: string | null;
	newEmail: string;
	url: string;
}) {
	const greeting = opts.name ? `Hallo ${opts.name},` : 'Hallo,';

	const html = renderEmailLayout({
		preheader: 'Bestätige die Änderung deiner E-Mail-Adresse.',
		bodyHtml: `
			<p style="margin:0 0 16px">${greeting}</p>
			<p style="margin:0 0 16px">
				für dein Technikpool-Konto wurde eine neue E-Mail-Adresse angefragt:
				<strong>${opts.newEmail}</strong>. Die Änderung wird erst wirksam, wenn du
				sie hier bestätigst.
			</p>
			${renderButton('Neue E-Mail-Adresse bestätigen', opts.url)}
			<p style="margin:0;color:#71717a">
				Warst du das nicht, ignoriere diese E-Mail — deine Adresse bleibt dann
				unverändert. Ändere in dem Fall sicherheitshalber dein Passwort.
			</p>
		`
	});

	const text = [
		greeting,
		'',
		`für dein Technikpool-Konto wurde eine neue E-Mail-Adresse angefragt: ${opts.newEmail}.`,
		'Die Änderung wird erst wirksam, wenn du sie hier bestätigst:',
		'',
		opts.url,
		'',
		'Warst du das nicht, ignoriere diese E-Mail — deine Adresse bleibt dann unverändert.',
		'Ändere in dem Fall sicherheitshalber dein Passwort.'
	].join('\n');

	return {
		subject: 'Technikpool: Bestätige deine neue E-Mail-Adresse',
		html,
		text
	};
}
