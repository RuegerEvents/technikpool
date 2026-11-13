import { redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';

// The organization page became tabs; this page moved into one of them.
export function load({ params }) {
	redirect(308, resolve(`orgs/${params.id}/equipment/locations`));
}
