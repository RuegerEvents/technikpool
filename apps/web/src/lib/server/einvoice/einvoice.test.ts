import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { generateBillingPdf } from '../billing-pdf.ts';
import { buildEInvoice, type EInvoiceSource } from './model.ts';
import { toCii } from './cii.ts';

// The official check is Mustang (https://www.mustangproject.org), which runs
// the EN 16931 schematron over the XML and veraPDF over the PDF/A-3. It is a
// Java jar, so it is opt-in:
//
//   MUSTANG_JAR=/path/to/Mustang-CLI-2.26.0.jar pnpm --filter web test
const MUSTANG_JAR = process.env.MUSTANG_JAR;

function item(id: string, overrides: Partial<EInvoiceSource['items'][number]> = {}) {
	return {
		id,
		kind: 'EQUIPMENT',
		categoryId: 'cat-light',
		categoryName: 'Lighting',
		categoryNameDe: 'Licht',
		categoryColor: null,
		productId: 'prod-par',
		productLabel: 'Robe Spiider',
		bundleId: null,
		description: `Robe Spiider #${id}`,
		netPurchasePrice: 4200,
		ratePercent: 1.5,
		dailyRate: 63,
		lineTotal: 189,
		...overrides
	};
}

function invoice(overrides: Partial<EInvoiceSource> = {}): EInvoiceSource {
	return {
		number: 'RE-2026-0042',
		issueDate: new Date(2026, 9, 3),
		customerName: 'Stadthalle Musterstadt GmbH',
		customerContactPerson: 'Erika Mustermann',
		customerEmail: 'buchhaltung@stadthalle.example',
		customerVatId: 'DE123456789',
		customerAddressLine1: 'Hallenweg 1',
		customerAddressLine2: null,
		customerPostalCode: '12345',
		customerCity: 'Musterstadt',
		customerCountry: 'DE',
		serviceStartDate: new Date(2026, 8, 25),
		serviceEndDate: new Date(2026, 8, 27),
		paymentTermsDays: 14,
		dayCount: 3,
		discountType: 'PERCENT',
		discountValue: 7.5,
		vatRatePercent: 19,
		isKleinunternehmerSnapshot: false,
		organization: {
			name: 'Veranstaltungstechnik Beispiel e.K.',
			address: { line1: 'Lagerstraße 5', line2: null, postalCode: '54321', city: 'Beispielhausen' },
			taxNumber: '12/345/67890',
			vatId: 'DE987654321',
			billingEmail: 'rechnung@vt-beispiel.example',
			billingWebsite: 'vt-beispiel.example',
			bankAccountHolder: 'Veranstaltungstechnik Beispiel',
			iban: 'DE02120300000000202051',
			bic: 'BYLADEM1001',
			bankName: 'Deutsche Kreditbank',
			logoPath: null,
			isKleinunternehmer: false
		},
		items: [
			item('1'),
			item('2'),
			// A price that does not divide by the days: 1,845 €/day, 5,54 € for three.
			item('3', {
				productId: 'prod-cable',
				productLabel: 'Schuko 5m',
				netPurchasePrice: 123,
				dailyRate: 1.85,
				lineTotal: 5.54
			}),
			item('4', {
				kind: 'SERVICE',
				categoryId: 'svc-staff',
				categoryName: 'Staff',
				categoryNameDe: 'Personal',
				productId: null,
				productLabel: null,
				description: 'Techniker',
				netPurchasePrice: null,
				ratePercent: null,
				dailyRate: null,
				quantity: 10,
				unit: 'hour',
				unitPrice: 45,
				perDay: true,
				lineTotal: 1350,
				note: 'Auf- und Abbau'
			}),
			item('5', {
				kind: 'SERVICE',
				categoryId: 'svc-transport',
				categoryName: 'Transport',
				categoryNameDe: 'Transport',
				productId: null,
				productLabel: null,
				description: 'Transport',
				netPurchasePrice: null,
				ratePercent: null,
				dailyRate: null,
				quantity: 3,
				unit: 'flat',
				unitPrice: 33.33,
				perDay: false,
				lineTotal: 99.99
			})
		],
		...overrides
	};
}

describe('buildEInvoice', () => {
	it('adds up the way EN 16931 checks it', () => {
		const result = buildEInvoice(invoice());
		const cents = (value: number) => Math.round(value * 100);
		const lineSum = result.lines.reduce((sum, line) => sum + cents(line.netAmount), 0);
		expect(lineSum).toBe(cents(result.totals.lineTotal));
		for (const line of result.lines)
			expect(cents((line.netPrice / line.priceBaseQuantity) * line.quantity)).toBe(
				cents(line.netAmount)
			);
		expect(cents(result.totals.taxBasis)).toBe(
			cents(result.totals.lineTotal) - cents(result.totals.allowanceTotal)
		);
		expect(cents(result.totals.grandTotal)).toBe(
			cents(result.totals.taxBasis) + cents(result.totals.taxTotal)
		);
	});

	it('numbers the lines as the PDF does: one per product, services after equipment', () => {
		const result = buildEInvoice(invoice());
		expect(result.lines.map((line) => [line.name, line.quantity, line.unitCode])).toEqual([
			['Robe Spiider', 2, 'C62'],
			['Schuko 5m', 1, 'C62'],
			['Techniker', 30, 'HUR'],
			['Transport', 3, 'LS']
		]);
	});

	it('prices a line that does not divide evenly for its whole quantity', () => {
		const service = (lineTotal: number) =>
			item('1', {
				kind: 'SERVICE',
				productId: null,
				productLabel: null,
				description: 'Kabelbinder',
				quantity: 300,
				unit: 'piece',
				unitPrice: 0.33,
				perDay: false,
				lineTotal
			});
		// 0,33 × 300 is 99,00: per unit.
		expect(buildEInvoice(invoice({ items: [service(99)] })).lines[0]).toMatchObject({
			netPrice: 0.33,
			priceBaseQuantity: 1
		});
		// 100,00 over 300 is 0,3333…, which times 300 is 99,99: for all 300.
		expect(buildEInvoice(invoice({ items: [service(100)] })).lines[0]).toMatchObject({
			netPrice: 100,
			priceBaseQuantity: 300
		});
		expect(toCii(buildEInvoice(invoice()))).toContain(
			'<ram:ChargeAmount>189.00</ram:ChargeAmount>'
		);
	});

	it('marks a Kleinunternehmer invoice exempt', () => {
		const result = buildEInvoice(
			invoice({ isKleinunternehmerSnapshot: true, vatRatePercent: 0, discountType: null })
		);
		expect(result.vat).toMatchObject({ category: 'E', ratePercent: 0 });
		expect(result.totals.taxTotal).toBe(0);
		expect(toCii(result)).toContain('<ram:ExemptionReason>');
	});

	it('escapes what it is given', () => {
		const xml = toCii(buildEInvoice(invoice({ customerName: 'Müller & Söhne <GmbH>' })));
		expect(xml).toContain('Müller &amp; Söhne &lt;GmbH&gt;');
	});
});

describe.skipIf(!MUSTANG_JAR)('ZUGFeRD PDF, validated by Mustang', () => {
	const cases: [string, Partial<EInvoiceSource>][] = [
		['standard rate, percentage discount', {}],
		['amount discount', { discountType: 'AMOUNT', discountValue: 50 }],
		[
			'price for the whole quantity',
			{
				items: [
					item('1', {
						kind: 'SERVICE',
						productId: null,
						productLabel: null,
						description: 'Kabelbinder',
						quantity: 300,
						unit: 'piece',
						unitPrice: 0.33,
						perDay: false,
						lineTotal: 100
					})
				]
			}
		],
		[
			'Kleinunternehmer',
			{
				isKleinunternehmerSnapshot: true,
				vatRatePercent: 0,
				discountType: null,
				discountValue: null,
				customerVatId: null
			}
		]
	];
	const dir = mkdtempSync(join(tmpdir(), 'einvoice-'));

	it.each(cases)(
		'%s',
		async (name, overrides) => {
			const source = invoice(overrides);
			const pdf = await generateBillingPdf(
				'invoice',
				{
					...source,
					customerAddress: 'Hallenweg 1\n12345 Musterstadt',
					customerNumber: null,
					introText: 'Wie vereinbart, stellen wir Ihnen die folgenden Leistungen in Rechnung.',
					closingText: 'Bitte überweisen Sie den Betrag unter Angabe der Rechnungsnummer.',
					items: source.items
				},
				{ eInvoice: source }
			);
			const file = join(dir, `${name.replace(/\W+/g, '-')}.pdf`);
			writeFileSync(file, pdf);
			let report: string;
			try {
				report = execFileSync(
					'java',
					['-jar', MUSTANG_JAR!, '--no-notices', '--action', 'validate', '--source', file],
					{ encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
				);
			} catch (cause) {
				// Mustang exits non-zero on an invalid file; the report is still on stdout.
				report = (cause as { stdout?: string }).stdout ?? String(cause);
			}
			expect(report, `${file}\n${report}`).toMatch(/<summary status="valid"\/>/);
		},
		120_000
	);
});
