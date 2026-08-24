export type Column<T> = {
	key: string;
	label: string;
	sortable?: boolean;
	/** Return the value used for sorting and default display */
	accessor?: (row: T) => unknown;
	class?: string;
	headerClass?: string;
};
