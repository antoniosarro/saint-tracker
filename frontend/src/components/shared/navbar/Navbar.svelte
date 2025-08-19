<script lang="ts">
	import { page } from '$app/state';
	import { slide, fly } from 'svelte/transition';

	const navItems = [
		{ name: 'Home', href: '/' },
		{ name: 'Chi siamo', href: '/about' }
	];

	let isMobileMenuOpen = false;

	function toggleMobileMenu() {
		isMobileMenuOpen = !isMobileMenuOpen;
	}

	function closeMobileMenu() {
		isMobileMenuOpen = false;
	}
</script>

<header class="shadow-md">
	<nav class="container mx-auto flex h-16 items-center justify-between px-6 py-4">
		<!-- Logo -->
		<a
			href="/"
			class="flex items-center justify-center gap-1 text-xl font-bold text-gray-800 transition-colors hover:text-blue-600"
		>
			<span>Saint Tracker</span>
			<img src="logo.png" alt="Saint Tracker Logo" class="h-7 w-7 mb-2 object-contain" />
		</a>

		<!-- Navigation Links (Desktop) -->
		<div class="hidden space-x-8 md:flex">
			{#each navItems as item}
				<a
					href={item.href}
					class="font-medium text-gray-600 transition-colors hover:text-gray-900
          {page.url.pathname === item.href ? 'border-b-2 border-blue-600 pb-1 text-blue-600' : ''}"
				>
					{item.name}
				</a>
			{/each}
		</div>

		<!-- Mobile Menu Button -->
		<div class="md:hidden">
			<button
				on:click={toggleMobileMenu}
				class="text-gray-600 transition-transform duration-200 hover:text-gray-900 {isMobileMenuOpen
					? 'rotate-180'
					: ''}"
				aria-label="Menu"
				aria-expanded={isMobileMenuOpen}
			>
				{#if isMobileMenuOpen}
					<!-- Close icon -->
					<svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M6 18L18 6M6 6l12 12"
						/>
					</svg>
				{:else}
					<!-- Hamburger icon -->
					<svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M4 6h16M4 12h16M4 18h16"
						/>
					</svg>
				{/if}
			</button>
		</div>
	</nav>

	<!-- Mobile Menu -->
	{#if isMobileMenuOpen}
		<div class="border-t bg-white shadow-lg md:hidden" transition:slide={{ duration: 300 }}>
			<div class="space-y-4 px-6 py-4">
				{#each navItems as item, i (item.href)}
					<a
						href={item.href}
						on:click={closeMobileMenu}
						class="block py-2 font-medium text-gray-600 transition-all duration-200 hover:translate-x-1 hover:text-gray-900
            {page.url.pathname === item.href ? 'font-semibold text-blue-600' : ''}"
						in:fly={{ x: -30, duration: 300, delay: i * 100 }}
					>
						{item.name}
					</a>
				{/each}
			</div>
		</div>
	{/if}
</header>

<style>
	@keyframes slideDown {
		from {
			max-height: 0;
			opacity: 0;
		}
		to {
			max-height: 300px;
			opacity: 1;
		}
	}

	@keyframes fadeIn {
		from {
			opacity: 0;
			transform: translateY(-10px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	@keyframes slideInLeft {
		from {
			opacity: 0;
			transform: translateX(-20px);
		}
		to {
			opacity: 1;
			transform: translateX(0);
		}
	}

	.rotate-180 {
		transform: rotate(180deg);
	}
</style>
