// Turns a rendered invoice into a ZUGFeRD / Factur-X PDF: PDF/A-3b with the
// CII XML attached as `factur-x.xml`. The page content is untouched — what
// PDF/A asks of it (embedded fonts, no encryption, device colours described by
// an output intent) the renderer already does, so this adds only the
// document-level pieces pdf-lib leaves out:
//
// - the XMP metadata stream declaring PDF/A-3B and the Factur-X fields, with an
//   extension schema for the latter (PDF/A forbids undeclared XMP properties)
// - an sRGB output intent, since every colour is drawn in DeviceRGB
// - a trailer /ID
// - the attachment, with AFRelationship /Alternative: the XML says what the
//   PDF says, and it is the XML a recipient's software books

import { createHash } from 'node:crypto';
import { AFRelationship, PDFHexString, PDFName, type PDFDocument } from 'pdf-lib';
import { SRGB_ICC } from './srgb-icc.ts';

export const FACTURX_FILENAME = 'factur-x.xml';
const FACTURX_NS = 'urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#';
const PRODUCER = 'Technikpool';
// The xpacket header names the byte order mark it is written in.
const BOM = '\uFEFF';

function esc(value: string) {
	return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// XMP and the Info dictionary must agree to the second; pdf-lib writes the
// Info dates without milliseconds.
function xmpDate(date: Date) {
	return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function extensionProperty(name: string, description: string) {
	return `<rdf:li rdf:parseType="Resource"><pdfaProperty:name>${name}</pdfaProperty:name><pdfaProperty:valueType>Text</pdfaProperty:valueType><pdfaProperty:category>external</pdfaProperty:category><pdfaProperty:description>${description}</pdfaProperty:description></rdf:li>`;
}

function xmp(title: string, date: Date) {
	return `<?xpacket begin="${BOM}" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
<rdf:Description rdf:about="" xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/">
<pdfaid:part>3</pdfaid:part>
<pdfaid:conformance>B</pdfaid:conformance>
</rdf:Description>
<rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:format>application/pdf</dc:format>
<dc:title><rdf:Alt><rdf:li xml:lang="x-default">${esc(title)}</rdf:li></rdf:Alt></dc:title>
</rdf:Description>
<rdf:Description rdf:about="" xmlns:pdf="http://ns.adobe.com/pdf/1.3/">
<pdf:Producer>${PRODUCER}</pdf:Producer>
</rdf:Description>
<rdf:Description rdf:about="" xmlns:xmp="http://ns.adobe.com/xap/1.0/">
<xmp:CreatorTool>${PRODUCER}</xmp:CreatorTool>
<xmp:CreateDate>${xmpDate(date)}</xmp:CreateDate>
<xmp:ModifyDate>${xmpDate(date)}</xmp:ModifyDate>
</rdf:Description>
<rdf:Description rdf:about="" xmlns:fx="${FACTURX_NS}">
<fx:DocumentType>INVOICE</fx:DocumentType>
<fx:DocumentFileName>${FACTURX_FILENAME}</fx:DocumentFileName>
<fx:Version>1.0</fx:Version>
<fx:ConformanceLevel>EN 16931</fx:ConformanceLevel>
</rdf:Description>
<rdf:Description rdf:about="" xmlns:pdfaExtension="http://www.aiim.org/pdfa/ns/extension/" xmlns:pdfaSchema="http://www.aiim.org/pdfa/ns/schema#" xmlns:pdfaProperty="http://www.aiim.org/pdfa/ns/property#">
<pdfaExtension:schemas><rdf:Bag><rdf:li rdf:parseType="Resource">
<pdfaSchema:schema>Factur-X PDFA Extension Schema</pdfaSchema:schema>
<pdfaSchema:namespaceURI>${FACTURX_NS}</pdfaSchema:namespaceURI>
<pdfaSchema:prefix>fx</pdfaSchema:prefix>
<pdfaSchema:property><rdf:Seq>
${extensionProperty('DocumentFileName', 'The name of the embedded XML document')}
${extensionProperty('DocumentType', 'The type of the hybrid document in capital letters, e.g. INVOICE or ORDER')}
${extensionProperty('Version', 'The actual version of the standard applying to the embedded XML document')}
${extensionProperty('ConformanceLevel', 'The conformance level of the embedded XML document')}
</rdf:Seq></pdfaSchema:property>
</rdf:li></rdf:Bag></pdfaExtension:schemas>
</rdf:Description>
</rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;
}

/**
 * Makes `pdf` a Factur-X / ZUGFeRD invoice carrying `xml`. Call it last,
 * right before `save()`: it fixes the title and dates the metadata repeats.
 */
export async function makeZugferd(pdf: PDFDocument, xml: string, title: string, date = new Date()) {
	const context = pdf.context;
	date = new Date(Math.floor(date.getTime() / 1000) * 1000);

	pdf.setTitle(title);
	pdf.setProducer(PRODUCER);
	pdf.setCreator(PRODUCER);
	pdf.setCreationDate(date);
	pdf.setModificationDate(date);

	const xmlBytes = new TextEncoder().encode(xml);
	await pdf.attach(xmlBytes, FACTURX_FILENAME, {
		mimeType: 'text/xml',
		description: 'Factur-X/ZUGFeRD Rechnung',
		creationDate: date,
		modificationDate: date,
		afRelationship: AFRelationship.Alternative
	});

	const metadata = context.stream(xmp(title, date), { Type: 'Metadata', Subtype: 'XML' });
	pdf.catalog.set(PDFName.of('Metadata'), context.register(metadata));

	const profile = context.stream(SRGB_ICC, { N: 3 });
	const intent = context.obj({
		Type: 'OutputIntent',
		S: 'GTS_PDFA1',
		OutputConditionIdentifier: PDFHexString.fromText('sRGB'),
		Info: PDFHexString.fromText('sRGB IEC61966-2.1'),
		DestOutputProfile: context.register(profile)
	});
	pdf.catalog.set(PDFName.of('OutputIntents'), context.obj([context.register(intent)]));

	// Derived from the content rather than random, so the same invoice gets
	// the same identifier however often it is rendered.
	const id = createHash('md5').update(xmlBytes).update(title).digest('hex');
	context.trailerInfo.ID = context.obj([PDFHexString.of(id), PDFHexString.of(id)]);
}
