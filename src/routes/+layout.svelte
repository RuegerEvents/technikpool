<script lang="ts">
	import './layout.css';
	import { page } from '$app/state';
	import { Button } from '$lib/components/ui/button';
	import { signOut } from '$lib/auth-client';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { Toaster } from 'svelte-sonner';
	import { browser } from '$app/environment';
	import { DropdownMenu } from 'bits-ui';

	let { data, children } = $props();

	async function handleSignOut() {
		await signOut();
		goto(resolve('/auth/login'));
	}

	let isAuthRoute = $derived(page.url.pathname.startsWith('/auth'));
	let isPrintRoute = $derived(
		/\/(packing-list|delivery-note|crew-passes)$/.test(page.url.pathname)
	);
	let isCalendarRoute = $derived(page.url.pathname.startsWith('/calendar'));

	// Dark mode
	let dark = $state(browser ? document.documentElement.classList.contains('dark') : false);

	function toggleTheme() {
		dark = !dark;
		if (dark) {
			document.documentElement.classList.add('dark');
			localStorage.setItem('theme', 'dark');
		} else {
			document.documentElement.classList.remove('dark');
			localStorage.setItem('theme', 'light');
		}
	}

	let locale = $derived(data.locale ?? 'de');

	function switchLocale(newLocale: string) {
		document.cookie = `locale=${newLocale}; path=/; max-age=31536000; SameSite=Lax`;
		window.location.reload();
	}
</script>

{#if isAuthRoute || isPrintRoute}
	{@render children()}
{:else}
	<div class="flex h-dvh flex-col bg-zinc-50 dark:bg-zinc-950">
		<header class="sticky top-0 z-40 border-b bg-background shadow-sm">
			<div class="flex h-16 w-full items-center justify-between px-4 py-4 md:px-6">
				<div class="flex items-center gap-6 md:gap-10">
					<a href={resolve('/')} class="flex items-center space-x-2">
						<span class="inline-block text-xl font-bold tracking-tight">Technikpool</span>
					</a>
					{#if data.user}
						<nav class="hidden gap-6 md:flex">
							<a
								href={resolve('/assets')}
								class="text-sm font-medium transition-colors {page.url.pathname.startsWith(
									'/assets'
								)
									? 'text-foreground'
									: 'text-muted-foreground hover:text-foreground'}">Devices</a
							>
							<a
								href={resolve('/productions')}
								class="text-sm font-medium transition-colors {page.url.pathname.startsWith(
									'/productions'
								)
									? 'text-foreground'
									: 'text-muted-foreground hover:text-foreground'}">Productions</a
							>
							<a
								href={resolve('/calendar')}
								class="text-sm font-medium transition-colors {page.url.pathname.startsWith(
									'/calendar'
								)
									? 'text-foreground'
									: 'text-muted-foreground hover:text-foreground'}">Calendar</a
							>
							<a
								href={resolve('/checkout')}
								class="text-sm font-medium transition-colors {page.url.pathname.startsWith(
									'/checkout'
								)
									? 'text-foreground'
									: 'text-muted-foreground hover:text-foreground'}">Checkout</a
							>
							{#if data.isAdmin}
								<a
									href={resolve('/admin/users')}
									class="text-sm font-medium transition-colors {page.url.pathname.startsWith(
										'/admin'
									)
										? 'text-foreground'
										: 'text-muted-foreground hover:text-foreground'}">Admin</a
								>
							{/if}
						</nav>
					{/if}
				</div>

				<div class="flex items-center gap-2">
					<!-- Language switcher -->
					<div class="flex overflow-hidden rounded-md border border-input text-xs font-medium">
						<button
							type="button"
							onclick={() => switchLocale('de')}
							class="px-2.5 py-1.5 transition-colors {locale === 'de'
								? 'bg-primary text-primary-foreground'
								: 'bg-background text-muted-foreground hover:bg-muted'}">DE</button
						><button
							type="button"
							onclick={() => switchLocale('en')}
							class="px-2.5 py-1.5 transition-colors {locale === 'en'
								? 'bg-primary text-primary-foreground'
								: 'bg-background text-muted-foreground hover:bg-muted'}">EN</button
						>
					</div>
					<!-- Theme toggle -->
					<button
						type="button"
						onclick={toggleTheme}
						aria-label="Toggle theme"
						class="flex h-9 w-9 items-center justify-center rounded-md border border-input bg-background text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
					>
						{#if dark}
							<!-- Sun icon -->
							<svg
								xmlns="http://www.w3.org/2000/svg"
								width="16"
								height="16"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
								stroke-linejoin="round"
							>
								<circle cx="12" cy="12" r="4" /><path
									d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"
								/>
							</svg>
						{:else}
							<!-- Moon icon -->
							<svg
								xmlns="http://www.w3.org/2000/svg"
								width="16"
								height="16"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
								stroke-linejoin="round"
							>
								<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
							</svg>
						{/if}
					</button>

					{#if data.user}
						<DropdownMenu.Root>
							<DropdownMenu.Trigger>
								<button
									type="button"
									class="flex h-9 items-center gap-2 rounded-md border border-input bg-background px-3 text-sm font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
								>
									<svg
										xmlns="http://www.w3.org/2000/svg"
										width="15"
										height="15"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
										stroke-linecap="round"
										stroke-linejoin="round"
									>
										<circle cx="12" cy="8" r="4" /><path d="M20 21a8 8 0 1 0-16 0" />
									</svg>
									<span class="hidden md:inline">{data.user.name || data.user.email}</span>
									<svg
										xmlns="http://www.w3.org/2000/svg"
										width="13"
										height="13"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
										stroke-linecap="round"
										stroke-linejoin="round"
									>
										<path d="m6 9 6 6 6-6" />
									</svg>
								</button>
							</DropdownMenu.Trigger>
							<DropdownMenu.Portal>
								<DropdownMenu.Content
									align="end"
									sideOffset={6}
									class="z-50 min-w-[180px] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
								>
									<div class="truncate px-2 py-1.5 text-xs text-muted-foreground">
										{data.user.email}
									</div>
									<DropdownMenu.Separator class="my-1 h-px bg-border" />
									<DropdownMenu.Item
										onSelect={() => goto(resolve('/orgs'))}
										class="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm transition-colors outline-none hover:bg-accent hover:text-accent-foreground data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground"
									>
										<svg
											xmlns="http://www.w3.org/2000/svg"
											width="14"
											height="14"
											viewBox="0 0 24 24"
											fill="none"
											stroke="currentColor"
											stroke-width="2"
											stroke-linecap="round"
											stroke-linejoin="round"
										>
											<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline
												points="9 22 9 12 15 12 15 22"
											/>
										</svg>
										Organizations
									</DropdownMenu.Item>
									<DropdownMenu.Separator class="my-1 h-px bg-border" />
									<DropdownMenu.Item
										onSelect={handleSignOut}
										class="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-destructive transition-colors outline-none hover:bg-accent data-[highlighted]:bg-accent"
									>
										<svg
											xmlns="http://www.w3.org/2000/svg"
											width="14"
											height="14"
											viewBox="0 0 24 24"
											fill="none"
											stroke="currentColor"
											stroke-width="2"
											stroke-linecap="round"
											stroke-linejoin="round"
										>
											<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline
												points="16 17 21 12 16 7"
											/><line x1="21" y1="12" x2="9" y2="12" />
										</svg>
										Sign out
									</DropdownMenu.Item>
								</DropdownMenu.Content>
							</DropdownMenu.Portal>
						</DropdownMenu.Root>
					{:else}
						<Button variant="ghost" size="sm" href={resolve('/auth/login')}>Login</Button>
						<Button size="sm" href={resolve('/auth/register')}>Sign up</Button>
					{/if}
				</div>
			</div>
		</header>
		<main
			class="min-h-0 flex-1 {isCalendarRoute
				? 'overflow-hidden p-0'
				: 'overflow-auto px-4 py-6 md:px-6 md:py-8'}"
		>
			{@render children()}
		</main>
	</div>
{/if}

<Toaster richColors position="bottom-right" />
