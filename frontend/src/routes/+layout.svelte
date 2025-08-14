<script lang="ts">
	import '$styles/app.css';
	import favicon from '$lib/assets/favicon.svg';
	import { Navbar } from '$components/shared/navbar';
	import { Footer } from '$components/shared/footer';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<div class="flex min-h-screen flex-col">
	<Navbar />
	<main class="container mx-auto flex-1 px-6 py-8">
		{@render children?.()}
	</main>
	<Footer />
</div>
