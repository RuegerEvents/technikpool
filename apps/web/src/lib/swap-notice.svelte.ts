// How a swap of linked units reads where it happened: on the handout list and
// in the case check (see services/unit-swap.ts). `.svelte.ts` so wuchale
// extracts it.

type Swap = { partnerLabel: string; joined: string; partnerTo: string | null };

/** "Swapped in for 40000123 (Ring 1)", then where the other one went. */
export function swapNoticeText(swap: Swap): { title: string; detail: string } {
	return {
		title: swap.joined
			? `Swapped in for ${swap.partnerLabel} (${swap.joined})`
			: `Swapped in for ${swap.partnerLabel}`,
		detail: swap.partnerTo
			? `${swap.partnerLabel} now belongs to ${swap.partnerTo}`
			: `${swap.partnerLabel} is now loose`
	};
}

/** A whole kit went out in the booked one's place: "Instead of Ring 1 · booking moved to Ring 2". */
export function kitSwapNoticeText(swap: { replacedKitName: string; kitName: string }): string {
	return `Instead of ${swap.replacedKitName} · booking moved to ${swap.kitName}`;
}
