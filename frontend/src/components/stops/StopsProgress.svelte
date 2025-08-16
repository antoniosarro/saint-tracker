<script lang="ts">
	import type { Stop } from '$types/stop';

	export let stopsStats: {
		completed: number;
		skipped: number;
		remaining: number;
		total: number;
		totalDuration: number;
		progress: number;
		visitedProgress: number;
		currentStop: Stop | null;
		nextStop: Stop | null;
		skippedStops: Stop[];
	};

	export let currentStopData: Stop | null;
	export let nextStopData: Stop | null;
	export let onStopClick: (stop: Stop) => void;

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

<!-- Stops Progress Card -->
<div class="mb-4 rounded-xl bg-white p-4 shadow-sm md:mb-4">
	<div class="mb-3 flex items-center justify-between">
		<h2 class="text-lg font-semibold text-gray-900">Progresso</h2>
	</div>

	<div class="space-y-3">
		<!-- Progress Bar -->
		<div class="h-2 w-full rounded-full bg-gray-200">
			<div
				class="h-2 rounded-full bg-green-600 transition-all duration-300"
				style="width: {stopsStats.progress}%"
			></div>
		</div>

		<div class="flex justify-between text-sm">
			<span class="text-gray-600">{stopsStats.completed}/{stopsStats.total} fermate</span>
			<span class="text-gray-600">{Math.round(stopsStats.progress)}%</span>
		</div>

		<!-- Skip/Visit Progress -->
		{#if stopsStats.skipped > 0}
			<div class="h-1 w-full rounded-full bg-gray-200">
				<div
					class="h-1 rounded-full bg-orange-400 transition-all duration-300"
					style="width: {stopsStats.visitedProgress}%"
				></div>
			</div>
			<div class="flex justify-between text-xs text-gray-500">
				<span>{stopsStats.completed + stopsStats.skipped}/{stopsStats.total} visitate/saltate</span>
				<span>{stopsStats.skipped} saltate</span>
			</div>
		{/if}

		<!-- Current Stop Info -->
		{#if currentStopData}
			<div
				class="rounded-lg border border-yellow-200 bg-yellow-50 p-3"
				on:click={() => onStopClick(currentStopData)}
				on:keydown={(e) => {
					if (e.key === 'Enter' || e.key === ' ') {
						onStopClick(currentStopData);
					}
				}}
				role="button"
				tabindex="0"
			>
				<div class="text-sm font-medium text-yellow-800">
					Fermata {currentStopData.letter} in corso
				</div>
				<div class="mt-1 text-xs text-yellow-600">
					{currentStopData.route} • Iniziata: {formatTime(currentStopData.startTime)}
				</div>
			</div>
		{:else if nextStopData}
			<div
				on:click={() => onStopClick(nextStopData)}
				on:keydown={(e) => {
					if (e.key === 'Enter' || e.key === ' ') {
						onStopClick(nextStopData);
					}
				}}
				role="button"
				tabindex="0"
				class="rounded-lg border p-3 shadow-sm {nextStopData.done
					? 'border-green-200 bg-green-50'
					: nextStopData.skipped
						? 'border-orange-200 bg-orange-50'
						: nextStopData.startTime
							? 'border-yellow-200 bg-yellow-50'
							: nextStopData.isOngoing
								? 'border-blue-200 bg-blue-50'
								: 'border-gray-200 bg-white'}"
			>
				<div class="mb-2 flex items-center justify-between">
					<div class="flex items-center space-x-2">
						<span class="text-sm font-medium text-gray-900">
							{nextStopData.route}
						</span>
					</div>
					<span
						class="flex h-6 w-6 items-center justify-center rounded-full text-sm font-bold text-white {nextStopData.done
							? 'bg-green-500'
							: nextStopData.skipped
								? 'bg-orange-500'
								: nextStopData.startTime
									? 'bg-yellow-500'
									: nextStopData.isOngoing
										? 'bg-blue-500'
										: 'bg-gray-400'}"
					>
						{nextStopData.letter}
					</span>
				</div>
				<div class="space-y-1 text-xs">
					{#if nextStopData.done}
						<div class="text-green-700">
							<div class="font-semibold">Completata</div>
							<div>Durata: {formatDuration(nextStopData.duration)}</div>
							<div>
								{formatTime(nextStopData.startTime)} - {formatTime(nextStopData.endTime)}
							</div>
						</div>
					{:else if nextStopData.skipped}
						<div class="text-orange-700">
							<div class="font-semibold">Saltata</div>
						</div>
					{:else if nextStopData.startTime}
						<div class="text-yellow-700">
							<div>In corso...</div>
							<div>Iniziata: {formatTime(nextStopData.startTime)}</div>
						</div>
					{:else if nextStopData.isOngoing}
						<div class="text-blue-700">
							<div>Prossima fermata</div>
						</div>
					{:else}
						<div class="text-gray-600">
							<div>In attesa</div>
						</div>
					{/if}
				</div>
			</div>
		{/if}
	</div>
</div>
