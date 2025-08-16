<script lang="ts">
	import type { Stop } from '$types/stop';

	export let stops: Stop[] = [];
	export let onStopClick: (stop: Stop) => void;
	export let title: string = 'Fermate';
	export let maxHeight: string = 'max-h-80';

	function formatDuration(seconds: number): string {
		if (seconds < 60) return `${seconds}s`;
		const minutes = Math.floor(seconds / 60);
		const remainingSeconds = seconds % 60;
		return `${minutes}m ${remainingSeconds}s`;
	}

	function formatTime(date: Date | null): string {
		if (!date) return 'N/A';
		return date.toLocaleTimeString('it-IT', {
			hour: '2-digit',
			minute: '2-digit'
		});
	}
</script>

<div class="flex min-h-0 flex-1 flex-col rounded-xl bg-white p-4 shadow-sm">
	<h2 class="mb-4 flex-shrink-0 text-lg font-semibold text-gray-900">{title}</h2>
	<div class="{maxHeight} flex-1 overflow-y-auto pr-2">
		{#if stops.length === 0}
			<div class="text-sm text-gray-500">Nessuna fermata configurata</div>
		{:else}
			<div class="space-y-3">
				{#each stops as stop (stop.id)}
					<div
						class="rounded-lg border p-3 shadow-sm transition-all duration-200 hover:shadow-md {stop.done
							? 'border-green-200 bg-green-50'
							: stop.skipped
								? 'border-orange-200 bg-orange-50'
								: stop.startTime
									? 'border-yellow-200 bg-yellow-50'
									: stop.isOngoing
										? 'border-blue-200 bg-blue-50'
										: 'border-gray-200 bg-white'}"
					>
						<!-- Stop Header -->
						<div class="mb-2 flex items-center justify-between">
							<div
								class="flex flex-1 cursor-pointer items-center space-x-2"
								on:click={() => onStopClick(stop)}
								on:keydown={(e) => {
									if (e.key === 'Enter' || e.key === ' ') {
										onStopClick(stop);
									}
								}}
								role="button"
								tabindex="0"
							>
								<span class="text-sm font-medium text-gray-900">
									{stop.route}
								</span>
							</div>
							<div class="flex items-center space-x-2">
								<!-- Stop letter badge -->
								<span
									class="flex h-6 w-6 items-center justify-center rounded-full text-sm font-bold text-white shadow-sm {stop.done
										? 'bg-green-500'
										: stop.skipped
											? 'bg-orange-500'
											: stop.startTime
												? 'bg-yellow-500'
												: stop.isOngoing
													? 'bg-blue-500'
													: 'bg-gray-400'}"
								>
									{stop.letter}
								</span>
							</div>
						</div>

						<!-- Stop Details -->
						<div class="space-y-1 text-xs">
							{#if stop.done}
								<div class="text-green-700">
									<div class="font-semibold">Completata</div>
									<div>Durata: {formatDuration(stop.duration)}</div>
									<div>{formatTime(stop.startTime)} - {formatTime(stop.endTime)}</div>
								</div>
							{:else if stop.skipped}
								<div class="text-orange-700">
									<div class="font-semibold">Saltata</div>
								</div>
							{:else if stop.startTime}
								<div class="text-yellow-700">
									<div class="font-semibold">In corso...</div>
									<div>Iniziata: {formatTime(stop.startTime)}</div>
								</div>
							{:else if stop.isOngoing}
								<div class="text-blue-700">
									<div class="font-semibold">Prossima fermata</div>
								</div>
							{:else}
								<div class="text-gray-600">
									<div>In attesa</div>
								</div>
							{/if}
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</div>
</div>
