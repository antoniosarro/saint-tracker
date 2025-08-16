<script lang="ts">
	export let deviceInfo: {
		id: string;
		saint: string;
		saintSub: string;
		location: string;
		status: string;
		lastUpdate: string;
	};

	export let connectionStatus: string;
	export let connectionStatusColor: string;
	export let connectionStatusText: string;
	export let lastUpdate: string;
	export let onReconnect: () => void;
	export let onRefresh: () => void;
	export let error: string | null = null;
</script>

<!-- Header Card -->
<div class="mb-4 rounded-xl bg-white p-4 shadow-sm">
	<h1 class="text-lg font-semibold text-gray-900">{deviceInfo.saint}</h1>
	<h2 class="text-base text-gray-900">{deviceInfo.saintSub}</h2>
</div>

<!-- Device Information Card -->
<div class="mb-4 rounded-xl bg-white p-4 shadow-sm">
	<h2 class="mb-3 text-lg font-semibold text-gray-900">Informazioni</h2>
	<div class="space-y-3">
		<div class="flex items-center justify-between">
			<span class="text-sm font-medium text-gray-600">Luogo:</span>
			<span class="text-sm text-gray-900">{deviceInfo.location}</span>
		</div>
		<div class="flex items-center justify-between">
			<span class="text-sm font-medium text-gray-600">Stato:</span>
			<span class="flex items-center text-sm font-medium {connectionStatusColor}">
				<div class="mr-2 h-2 w-2 rounded-full bg-current"></div>
				{connectionStatusText}
			</span>
		</div>
		<div class="flex items-center justify-between">
			<span class="text-sm font-medium text-gray-600">Ultimo aggiornamento:</span>
			<span class="text-sm text-gray-900">{lastUpdate}</span>
		</div>
	</div>
</div>

<!-- Connection Controls Card -->
{#if connectionStatus === 'error' || connectionStatus === 'disconnected'}
	<div class="mb-4 rounded-xl bg-white p-4 shadow-sm">
		<div class="space-y-2">
			<button
				class="w-full rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
				on:click={onReconnect}
			>
				Riconnetti
			</button>
			<button
				class="w-full rounded-lg bg-gray-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-700"
				on:click={onRefresh}
			>
				Aggiorna Dati
			</button>
		</div>
	</div>
{/if}

<!-- Error Display Card -->
{#if error}
	<div class="mb-4 rounded-xl bg-white p-4 shadow-sm">
		<div class="rounded-lg bg-red-50 p-3">
			<div class="text-sm font-medium text-red-800">Errore:</div>
			<div class="mt-1 text-xs text-red-600">{error}</div>
		</div>
	</div>
{/if}
