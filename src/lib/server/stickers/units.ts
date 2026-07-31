export const MM_TO_PT = 72 / 25.4;

export function mm(value: number): number {
	return value * MM_TO_PT;
}

export function ptToMm(value: number): number {
	return value / MM_TO_PT;
}
