<script lang="ts">
	export let connectionStatus: string;
</script>

<!-- Map Controls Overlay -->
<div class="absolute right-2 top-2 z-10 space-y-2 md:right-4 md:top-4">
	<!-- WebSocket Status Indicator -->
	<div class="rounded-lg bg-white px-3 py-2 shadow-lg">
		<div class="flex items-center space-x-2">
			<div
				class="h-2 w-2 rounded-full {connectionStatus === 'connected'
					? 'bg-green-500'
					: connectionStatus === 'loading'
						? 'bg-yellow-500'
						: 'bg-red-500'}"
			></div>
			<span class="text-xs font-medium text-gray-700">
				{connectionStatus === 'connected'
					? 'Live'
					: connectionStatus === 'loading'
						? 'Caricamento'
						: 'Offline'}
			</span>
		</div>
	</div>
</div>