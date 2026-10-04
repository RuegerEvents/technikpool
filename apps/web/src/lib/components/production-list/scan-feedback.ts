/** The answer to one scan, shown under the field and over the camera picture. */
export type ScanFeedback = {
	tone: 'good' | 'warn' | 'bad' | 'info';
	title: string;
	detail?: string;
	/**
	 * A follow-up the scan offers — the rest of a kit, say. `run` answering
	 * false means it was declined, and the offer stays.
	 */
	action?: { label: string; run: () => Promise<boolean | void> };
};
