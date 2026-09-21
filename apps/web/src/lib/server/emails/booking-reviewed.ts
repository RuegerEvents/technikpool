import { escapeHtml, renderButton, renderEmailLayout } from './layout';

type ProductCount = { productName: string; count: number };

const unitCount = (lines: ProductCount[]) => lines.reduce((sum, line) => sum + line.count, 0);

function renderList(heading: string, lines: ProductCount[]) {
	if (lines.length === 0) return '';
	const items = lines
		.map((line) => `<li>${line.count}× ${escapeHtml(line.productName)}</li>`)
		.join('');
	return `<p style="margin:0 0 4px"><strong>${heading}</strong></p><ul style="margin:0 0 16px;padding-left:20px">${items}</ul>`;
}

function textList(heading: string, lines: ProductCount[]) {
	if (lines.length === 0) return [];
	return [heading, ...lines.map((line) => `  • ${line.count}× ${line.productName}`), ''];
}

export function bookingReviewedEmail(opts: {
	name?: string | null;
	ownerOrgName: string;
	productionName: string;
	approved: ProductCount[];
	declined: ProductCount[];
	url: string;
}) {
	const greeting = opts.name ? `Hallo ${opts.name},` : 'Hallo,';
	const approvedCount = unitCount(opts.approved);
	const declinedCount = unitCount(opts.declined);
	const tally = [
		approvedCount > 0 ? `${approvedCount} zugesagt` : null,
		declinedCount > 0 ? `${declinedCount} abgelehnt` : null
	]
		.filter(Boolean)
		.join(', ');
	const approvedHeading = `Zugesagt (${approvedCount})`;
	const declinedHeading = `Abgelehnt (${declinedCount})`;

	const html = renderEmailLayout({
		preheader: `${opts.ownerOrgName} hat eure Anfragen für "${opts.productionName}" bearbeitet${tally ? `: ${tally}` : ''}.`,
		bodyHtml: `
			<p style="margin:0 0 16px">${escapeHtml(greeting)}</p>
			<p style="margin:0 0 16px">
				<strong>${escapeHtml(opts.ownerOrgName)}</strong> hat alle offenen Ausleihanfragen für die
				Produktion <strong>${escapeHtml(opts.productionName)}</strong> bearbeitet. So steht es
				jetzt bei ${escapeHtml(opts.ownerOrgName)}:
			</p>
			${renderList(approvedHeading, opts.approved)}
			${renderList(declinedHeading, opts.declined)}
			${renderButton('Produktion ansehen', opts.url)}
		`
	});

	const text = [
		greeting,
		'',
		`${opts.ownerOrgName} hat alle offenen Ausleihanfragen für die Produktion "${opts.productionName}" bearbeitet. So steht es jetzt bei ${opts.ownerOrgName}:`,
		'',
		...textList(approvedHeading, opts.approved),
		...textList(declinedHeading, opts.declined),
		opts.url
	].join('\n');

	return {
		subject: `Technikpool: Anfragen für "${opts.productionName}" bearbeitet${tally ? ` (${tally})` : ''}`,
		html,
		text
	};
}
