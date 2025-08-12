<script lang="ts">
	import '$styles/app.css';
	import favicon from '$lib/assets/favicon.svg';
	import { Navbar } from '$components/shared/navbar';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<Navbar />
<main class="container mx-auto h-[calc(100vh-4rem)] px-6 py-8">
	{@render children?.()}
</main>
