import { goto } from '$app/navigation';

// For a link inside a clickable row: the row must not also react to the
// click, but `stopPropagation()` alone also keeps it from SvelteKit's router,
// which listens on the document — so the browser loaded the whole page anew,
// and every Back button lost the way it came (see back-navigation.ts).
// This stops the row and navigates in the app instead.
export function rowLinkClick(event: MouseEvent) {
	event.stopPropagation();
	if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
		return;
	const link = event.currentTarget as HTMLAnchorElement;
	if (link.target && link.target !== '_self') return;
	event.preventDefault();
	goto(link.href);
}
