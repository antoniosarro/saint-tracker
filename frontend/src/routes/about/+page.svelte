<script lang="ts">
	import {
		Github,
		Linkedin,
		Mail,
		ExternalLink,
		Heart,
		Code2,
		MapPin,
		Star,
		Sparkles
	} from 'lucide-svelte';

	const developers = [
		{
			name: 'Antonio Sarro',
			role: 'Full Stack Developer',
			bio: "FullStack Developer di 25 anni. Ho sempre avuto una forte passione e predisposizione  per l'hardware e l'informatica fin da bambino, che mi ha sempre spinto ad imparare e approfondire questo campo. Essendo una persona molto curiosa che vuole sempre scoprire qualcosa di nuovo, mi piace studiare e comprendere nuove tecnologie per progetti personali o futuri.",
			avatar: 'antonio.jpg',
			location: 'Italia',
			social: {
				github: 'https://github.com/antoniosarro',
				linkedin: 'https://www.linkedin.com/in/antoniosarro99',
				email: 'contact@antoniosarro.dev'
			}
		},
		{
			name: 'Giovanni Rapa',
			role: 'Penetration Tester',
			bio: 'Ho 25 anni e una laurea magistrale in Informatica. La mia passione per la cybersecurity nasce dall’interesse per la tecnologia e la curiosità di capire come funzionano i sistemi nel profondo. Mi occupo di scoprire vulnerabilità, testare la sicurezza dei sistemi e approfondire nuove tecniche per proteggere le infrastrutture digitali. Credo che la curiosità e la voglia di sperimentare siano fondamentali per crescere in questo campo, quindi mi piace mettermi alla prova con progetti personali, imparare costantemente e rimanere aggiornato sulle evoluzioni del settore.',
			avatar: 'giovanni.jpg',
			location: 'Italia',
			social: {
				github: 'https://github.com/Givaa',
				linkedin: 'https://www.linkedin.com/in/giovanni-rapa-aa346b218',
				email: 'friend.email@example.com'
			}
		}
	];

	const projectInfo = {
		name: 'Saint Tracker',
		description:
			'Un sistema di tracciamento GPS in tempo reale progettato per processioni religiose ed eventi comunitari. Costruito con tecnologie web moderne per fornire tracciamento preciso della posizione e monitoraggio dei percorsi.',
		technologies: [
			'SvelteKit',
			'TypeScript',
			'Leaflet',
			'WebSockets',
			'Tailwind CSS',
			'ESP32',
			'Golang',
			'Sqlite3'
		],
		features: [
			'Tracciamento GPS in tempo reale',
			'Visualizzazione interattiva della mappa',
			'Rilevamento e gestione delle fermate',
			'Aggiornamenti live tramite WebSocket',
			'Design responsive per mobile',
			'Analytics e statistiche del percorso'
		]
	};
</script>

<svelte:head>
	<title>Chi Siamo - Saint Tracker</title>
	<meta
		name="description"
		content="Scopri il team dietro Saint Tracker e la nostra missione di fornire soluzioni innovative per il tracciamento GPS."
	/>
</svelte:head>

<div class="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
	<!-- Hero Section -->
	<div class="relative overflow-hidden bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800">
		<div class="relative py-20 text-white">
			<div class="container mx-auto px-6">
				<div class="text-center">
					<div class="mb-6 flex justify-center">
						<div class="rounded-full bg-white/10 p-4 backdrop-blur-sm">
							<Sparkles class="h-10 w-10 text-white" />
						</div>
					</div>
					<h1
						class="mb-6 bg-gradient-to-r from-white to-blue-100 bg-clip-text text-4xl font-bold text-transparent md:text-5xl"
					>
						Chi Siamo
					</h1>
					<p class="mx-auto max-w-2xl text-lg leading-relaxed opacity-90">
						Soluzioni innovative di tracciamento GPS costruite con passione e tecnologie moderne
					</p>
				</div>
			</div>
		</div>
	</div>

	<!-- Project Information -->
	<div class="py-20">
		<div class="container mx-auto px-6">
			<div class="mx-auto max-w-6xl">
				<div class="mb-16 text-center">
					<h2 class="mb-6 text-4xl font-bold text-gray-900">Il Nostro Progetto</h2>
					<p class="mx-auto max-w-3xl text-xl leading-relaxed text-gray-600">
						{projectInfo.description}
					</p>
				</div>

				<div class="grid gap-8 lg:grid-cols-2">
					<!-- Features -->
					<div
						class="group rounded-2xl bg-white p-8 shadow-lg transition-all duration-300 hover:-translate-y-2 hover:shadow-2xl"
					>
						<div class="mb-6 flex items-center">
							<div
								class="mr-4 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-600 p-3 shadow-lg"
							>
								<Code2 class="h-6 w-6 text-white" />
							</div>
							<h3 class="text-2xl font-bold text-gray-900">Funzionalità Principali</h3>
						</div>
						<ul class="space-y-4">
							{#each projectInfo.features as feature}
								<li
									class="flex items-center text-gray-600 transition-colors group-hover:text-gray-800"
								>
									<div
										class="mr-3 h-2 w-2 rounded-full bg-gradient-to-r from-blue-500 to-indigo-500 shadow-sm"
									></div>
									<span class="font-medium">{feature}</span>
								</li>
							{/each}
						</ul>
					</div>

					<!-- Technologies -->
					<div
						class="group rounded-2xl bg-white p-8 shadow-lg transition-all duration-300 hover:-translate-y-2 hover:shadow-2xl"
					>
						<div class="mb-6 flex items-center">
							<div
								class="mr-4 rounded-2xl bg-gradient-to-br from-green-500 to-emerald-600 p-3 shadow-lg"
							>
								<ExternalLink class="h-6 w-6 text-white" />
							</div>
							<h3 class="text-2xl font-bold text-gray-900">Tecnologie</h3>
						</div>
						<div class="flex flex-wrap gap-3">
							{#each projectInfo.technologies as tech}
								<span
									class="rounded-xl bg-gradient-to-r from-gray-100 to-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm transition-all hover:scale-105 hover:shadow-md"
								>
									{tech}
								</span>
							{/each}
						</div>
					</div>
				</div>
			</div>
		</div>
	</div>

	<!-- Team Section -->
	<div class="bg-white py-20">
		<div class="container mx-auto px-6">
			<div class="mx-auto max-w-6xl">
				<div class="mb-16 text-center">
					<h2 class="mb-6 text-4xl font-bold text-gray-900">Incontra il Team</h2>
					<p class="text-xl text-gray-600">Gli sviluppatori appassionati dietro Saint Tracker</p>
				</div>

				<div class="grid gap-10 lg:grid-cols-2">
					{#each developers as developer}
						<div
							class="group rounded-3xl bg-gradient-to-br from-gray-50 to-blue-50 p-10 shadow-xl transition-all duration-300 hover:-translate-y-3 hover:shadow-2xl"
						>
							<!-- Avatar and Basic Info -->
							<div class="mb-8 text-center">
								<div class="relative mx-auto mb-6 h-32 w-32">
									<img
										src={developer.avatar}
										alt="Avatar di {developer.name}"
										class="h-full w-full rounded-full border-4 border-white object-cover shadow-2xl transition-transform group-hover:scale-110"
									/>
									<div
										class="absolute -bottom-2 -right-2 rounded-full bg-gradient-to-r from-blue-500 to-indigo-600 p-2 shadow-lg"
									>
										<Star class="h-5 w-5 text-white" />
									</div>
								</div>
								<h3 class="text-2xl font-bold text-gray-900">{developer.name}</h3>
								<p
									class="bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-lg font-semibold text-transparent"
								>
									{developer.role}
								</p>
								<div class="mt-3 flex items-center justify-center text-gray-500">
									<MapPin class="mr-2 h-5 w-5" />
									<span class="font-medium">{developer.location}</span>
								</div>
							</div>

							<!-- Bio -->
							<p class="mb-8 text-center leading-relaxed text-gray-600">{developer.bio}</p>

							<!-- Social Links -->
							<div class="flex justify-center space-x-4">
								<a
									href={developer.social.github}
									target="_blank"
									rel="noopener noreferrer"
									class="rounded-2xl bg-gradient-to-r from-gray-800 to-gray-900 p-3 text-white shadow-lg transition-all hover:-translate-y-1 hover:scale-110 hover:shadow-xl"
									aria-label="Profilo GitHub"
								>
									<Github class="h-6 w-6" />
								</a>
								<a
									href={developer.social.linkedin}
									target="_blank"
									rel="noopener noreferrer"
									class="rounded-2xl bg-gradient-to-r from-blue-600 to-blue-700 p-3 text-white shadow-lg transition-all hover:-translate-y-1 hover:scale-110 hover:shadow-xl"
									aria-label="Profilo LinkedIn"
								>
									<Linkedin class="h-6 w-6" />
								</a>
								<a
									href="mailto:{developer.social.email}"
									class="rounded-2xl bg-gradient-to-r from-red-500 to-red-600 p-3 text-white shadow-lg transition-all hover:-translate-y-1 hover:scale-110 hover:shadow-xl"
									aria-label="Invia Email"
								>
									<Mail class="h-6 w-6" />
								</a>
							</div>
						</div>
					{/each}
				</div>
			</div>
		</div>
	</div>

	<!-- Mission Section -->
	<div
		class="relative overflow-hidden bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 py-20"
	>
		<div class="container relative mx-auto px-6">
			<div class="mx-auto max-w-4xl text-center">
				<div class="mb-8 flex justify-center">
					<div class="rounded-full bg-gradient-to-br from-red-500 to-pink-600 p-6 shadow-2xl">
						<Heart class="h-10 w-10 text-white" />
					</div>
				</div>
				<h2 class="mb-8 text-3xl font-bold text-gray-900">La Nostra Missione</h2>
				<p class="mb-10 text-lg leading-relaxed text-gray-600">
					Crediamo nell'utilizzare la tecnologia per rafforzare le comunità e preservare le
					tradizioni. Saint Tracker è nato dal desiderio di aiutare a organizzare processioni
					religiose ed eventi comunitari in modo più efficace, garantendo sicurezza e coordinamento
					mantenendo la natura sacra di queste celebrazioni.
				</p>
				<div class="rounded-3xl border border-white/20 bg-white/80 p-8 shadow-2xl backdrop-blur-sm">
					<div class="mb-4 flex justify-center">
						<div class="rounded-full bg-blue-100 p-2">
							<Sparkles class="h-6 w-6 text-blue-600" />
						</div>
					</div>
					<p class="text-lg font-medium italic leading-relaxed text-gray-700">
						"Technology should serve humanity, not the other way around. Our goal is to create tools
						that bring people together and support the things that matter most to communities."
					</p>
				</div>
			</div>
		</div>
	</div>
</div>
