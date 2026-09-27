import { Marked, type Tokens } from 'marked';

// Markdown for the operator's legal pages. Only a system admin writes it, but
// it is shown to everyone, signed out included, so it is rendered as if it were
// hostile anyway: raw HTML is shown as text rather than passed through, links
// only go to http(s), mailto, tel or a path on this site, and images are not
// rendered at all (an imprint has no use for one, and an image is a request to
// whatever host it names).

const escapeHtml = (s: string) =>
	s
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');

function safeHref(href: string): string | null {
	const trimmed = href.trim();
	if (trimmed.startsWith('/') && !trimmed.startsWith('//')) return trimmed;
	try {
		const url = new URL(trimmed);
		return ['http:', 'https:', 'mailto:', 'tel:'].includes(url.protocol) ? url.href : null;
	} catch {
		return null;
	}
}

const marked = new Marked({
	gfm: true,
	// Plain Markdown line handling: a single newline is a space. The templates
	// in docs/legal are hard-wrapped, and turning every wrap into a <br> broke
	// their sentences mid-line.
	breaks: false,
	renderer: {
		html({ text }: Tokens.HTML | Tokens.Tag) {
			return escapeHtml(text);
		},
		link({ href, title, tokens }: Tokens.Link) {
			const text = this.parser.parseInline(tokens);
			const safe = safeHref(href);
			if (!safe) return text;
			const external = !safe.startsWith('/');
			return `<a href="${escapeHtml(safe)}"${title ? ` title="${escapeHtml(title)}"` : ''}${
				external ? ' rel="noopener noreferrer" target="_blank"' : ''
			}>${text}</a>`;
		},
		image({ text }: Tokens.Image) {
			return escapeHtml(text);
		}
	}
});

export function renderMarkdown(source: string): string {
	return marked.parse(source, { async: false });
}
