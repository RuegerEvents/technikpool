import { escapeHtml, renderEmailLayout } from './layout';

// Sent to whoever accepted the data processing agreement, with the record as a
// PDF attached: their organization's copy of the contract.
export function dpaAcceptedEmail(opts: {
	name: string;
	orgName: string;
	acceptedAt: Date;
	instanceUrl: string;
}) {
	const greeting = `Hallo ${opts.name},`;
	const when = opts.acceptedAt.toLocaleString('de-DE', {
		dateStyle: 'long',
		timeStyle: 'short',
		timeZone: 'Europe/Berlin'
	});

	const html = renderEmailLayout({
		preheader: `Auftragsverarbeitungsvertrag für ${opts.orgName} angenommen.`,
		bodyHtml: `
			<p style="margin:0 0 16px">${escapeHtml(greeting)}</p>
			<p style="margin:0 0 16px">
				du hast am ${escapeHtml(when)} für <strong>${escapeHtml(opts.orgName)}</strong> den
				Auftragsverarbeitungsvertrag mit dem Betreiber von ${escapeHtml(opts.instanceUrl)} angenommen.
			</p>
			<p style="margin:0 0 16px">
				Im Anhang findest du den Vertrag mit dem Nachweis der Annahme als PDF. Bewahre ihn bei euren
				Unterlagen zum Datenschutz auf. Owner deiner Organisation können ihn in Technikpool auf der
				Seite der Organisation jederzeit wieder herunterladen.
			</p>
		`
	});

	const text = [
		greeting,
		'',
		`du hast am ${when} für "${opts.orgName}" den Auftragsverarbeitungsvertrag mit dem Betreiber von ${opts.instanceUrl} angenommen.`,
		'',
		'Im Anhang findest du den Vertrag mit dem Nachweis der Annahme als PDF. Bewahre ihn bei euren Unterlagen zum Datenschutz auf. Owner deiner Organisation können ihn in Technikpool auf der Seite der Organisation jederzeit wieder herunterladen.'
	].join('\n');

	return {
		subject: `Technikpool: Auftragsverarbeitungsvertrag für "${opts.orgName}"`,
		html,
		text
	};
}
