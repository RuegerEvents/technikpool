<script lang="ts">
	import * as Card from '$lib/components/ui/card';
	import { getCalendarData } from '$lib/remote/productions.remote';
	import { Calendar, ResourceTimeline } from '@event-calendar/core';
	import '@event-calendar/core/index.css';

	const plugins = [ResourceTimeline];

	async function buildCalendar() {
		const assets = await getCalendarData();

		const resources = assets.map((a: any) => ({
			id: a.id,
			title: `${a.product.name} (${a.product.manufacturer.name})`
		}));

		const events: any[] = [];
		assets.forEach((a: any) => {
			a.productionItems.forEach((item: any) => {
				if (item.production.startDate && item.production.endDate) {
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
</script>

<div class="space-y-6">
	<div>
		<h1 class="text-3xl font-bold tracking-tight">Availability Calendar</h1>
		<p class="text-muted-foreground">View equipment bookings across all your organizations.</p>
	</div>

	<Card.Root>
		<Card.Content class="p-0 sm:p-6">
			{@const options = await buildCalendar()}
			<div class="ec-theme-default bg-background text-foreground h-[600px] overflow-hidden rounded-md border">
				<Calendar {plugins} {options} />
			</div>
		</Card.Content>
	</Card.Root>
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

	:global(.ec-resource-area) {
		min-width: 250px;
	}
</style>
