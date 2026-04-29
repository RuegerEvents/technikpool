<script lang="ts">
	import { getCalendarData } from '$lib/remote/productions.remote';
	import { Calendar, ResourceTimeline } from '@event-calendar/core';
	import '@event-calendar/core/index.css';

	const plugins = [ResourceTimeline];

	async function buildCalendar() {
		const assets = await getCalendarData();

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const resources = assets.map((a: any) => ({
			id: a.id,
			title: `${a.product.name} (${a.product.manufacturer.name})`
		}));

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const events: any[] = [];
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		assets.forEach((a: any) => {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			a.productionItems.forEach((item: any) => {
				if (item.production.startDate && item.production.endDate) {
					// eslint-disable-next-line svelte/prefer-svelte-reactivity
					const end = new Date(item.production.endDate);
					end.setDate(end.getDate() + 1);
					events.push({
						id: item.id,
						resourceId: a.id,
						title: item.production.name,
						start: new Date(item.production.startDate),
						end,
						allDay: true,
						backgroundColor: item.status === 'APPROVED' ? '#10b981' : '#3b82f6',
						borderColor: item.status === 'APPROVED' ? '#059669' : '#2563eb'
					});
				}
			});
		});

		return {
			view: 'resourceTimelineMonth',
			headerToolbar: {
				start: 'prev,next today',
				center: 'title',
				end: 'resourceTimelineWeek,resourceTimelineMonth'
			},
			resources,
			events,
			resourceAreaWidth: '25%'
		};
	}
	const options = $derived(await buildCalendar());
</script>

<svelte:head><title>Calendar | Technikpool</title></svelte:head>

<div class="ec-theme-default h-full min-h-0 overflow-hidden p-4 text-foreground">
	<Calendar {plugins} {options} />
</div>

<style>
	:global(.ec-theme-default) {
		--ec-bg-color: transparent;
		--ec-border-color: hsl(var(--border));
		--ec-text-color: hsl(var(--foreground));
		--ec-button-bg-color: hsl(var(--background));
		--ec-button-border-color: hsl(var(--border));
		--ec-button-text-color: hsl(var(--foreground));
		--ec-button-active-bg-color: hsl(var(--accent));
		--ec-button-active-border-color: hsl(var(--border));
		--ec-button-active-text-color: hsl(var(--accent-foreground));
		--ec-today-bg-color: hsl(var(--muted));
	}

	:global(.ec-theme-default .ec) {
		height: 100%;
	}

	:global(.ec-resource-area) {
		min-width: 250px;
	}
</style>
