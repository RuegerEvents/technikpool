import { renderButton, renderEmailLayout } from './layout';

const dateFormatter = new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium' });

function formatDateRange(startDate: Date | null, endDate: Date | null) {
	if (!startDate || !endDate) return null;
	return `${dateFormatter.format(startDate)} – ${dateFormatter.format(endDate)}`;
}

export function addedAsCrewEmail(opts: {
	name?: string | null;
	productionName: string;
	role?: string | null;
	startDate?: Date | null;
	endDate?: Date | null;
	url: string;
}) {
	const greeting = opts.name ? `Hallo ${opts.name},` : 'Hallo,';
	const dateRange = formatDateRange(opts.startDate ?? null, opts.endDate ?? null);

	const html = renderEmailLayout({
		preheader: `Du wurdest der Produktion "${opts.productionName}" als Crew hinzugefügt.`,
		bodyHtml: `
			<p style="margin:0 0 16px">${greeting}</p>
			<p style="margin:0 0 16px">
				du wurdest der Produktion <strong>${opts.productionName}</strong>
				${opts.role ? `als <strong>${opts.role}</strong>` : ''} hinzugefügt.
				${dateRange ? `Zeitraum: ${dateRange}.` : ''}
			</p>
			${renderButton('Produktion ansehen', opts.url)}
		`
	});

	const text = [
		greeting,
		'',
		`du wurdest der Produktion "${opts.productionName}"${opts.role ? ` als ${opts.role}` : ''} hinzugefügt.`,
		dateRange ? `Zeitraum: ${dateRange}.` : '',
		'',
		opts.url
	]
		.filter(Boolean)
		.join('\n');

	return {
		subject: `Technikpool: Du bist Crew bei "${opts.productionName}"`,
		html,
		text
	};
}
