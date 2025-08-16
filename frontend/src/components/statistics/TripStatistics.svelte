<script lang="ts">
	export let totalDistance: number;
	export let stats: {
		maxSpeed: number;
		avgSpeed: number;
		duration: number;
	};
</script>

<div class="mb-4 rounded-xl bg-white p-4 shadow-sm md:mt-auto">
	<h2 class="mb-4 text-lg font-semibold text-gray-900">Statistiche</h2>
	<div class="flex flex-col gap-4">
		<div class="flex items-center justify-between">
			<span class="text-sm font-medium text-gray-600">Distanza totale:</span>
			<span class="text-sm text-gray-900">{(totalDistance / 1000).toFixed(1)} km</span>
		</div>
		<div class="flex items-center justify-between">
			<span class="text-sm font-medium text-gray-600">Velocità massima:</span>
			<span class="text-sm text-gray-900">{stats.maxSpeed.toFixed(1)} km/h</span>
		</div>
		<div class="flex items-center justify-between">
			<span class="text-sm font-medium text-gray-600">Velocità media:</span>
			<span class="text-sm text-gray-900">{stats.avgSpeed.toFixed(1)} km/h</span>
		</div>
		<div class="flex items-center justify-between">
			<span class="text-sm font-medium text-gray-600">Durata:</span>
			<span class="text-sm text-gray-900">{stats.duration} minuti</span>
		</div>
	</div>
</div>