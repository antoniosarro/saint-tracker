<script lang="ts">
 import { Heart, Mail, Github, Linkedin } from 'lucide-svelte';
 
 // Version information
 const version = '1.1.0'; // You can update this or import from package.json
 
 const currentYear = new Date().getFullYear();
 const quickLinks = [
   { name: 'Home', url: '/' },
   { name: 'Chi Siamo', url: '/about' },
   { name: 'Privacy Policy', url: '/privacy' },
   { name: 'Termini di Servizio', url: '/terms' }
 ];
</script>

<footer class="bg-gray-900 text-white">
  <div class="container mx-auto px-6 py-8">
    <!-- Contenuto Principale del Footer -->
    <div class="grid gap-8 md:grid-cols-4">
      <!-- Sezione Brand -->
      <div class="md:col-span-2">
        <h3 class="mb-4 text-xl font-bold">Saint Tracker</h3>
        <p class="mb-4 text-gray-300">
          Soluzioni di tracciamento GPS in tempo reale per processioni religiose ed eventi comunitari.
          Costruito con tecnologie moderne per rafforzare tradizioni e comunità.
        </p>
        <!-- Version Badge -->
        <div class="inline-flex items-center rounded-full bg-gray-800 px-3 py-1 text-xs text-gray-300">
          <span class="font-mono">{version}</span>
        </div>
      </div>

      <!-- Link Rapidi -->
      <div>
        <h4 class="mb-4 text-lg font-semibold">Link Rapidi</h4>
        <ul class="space-y-2">
          {#each quickLinks as link}
            <li>
              <a
                href={link.url}
                class="text-gray-300 transition-colors hover:text-white"
              >
                {link.name}
              </a>
            </li>
          {/each}
        </ul>
      </div>

      <!-- Informazioni di Contatto -->
      <div>
        <h4 class="mb-4 text-lg font-semibold">Contatti</h4>
        <div class="space-y-2 text-gray-300">
          <div class="text-sm">
            <a
              href="/about"
              class="transition-colors hover:text-white"
            >
              Conosci il team →
            </a>
          </div>
        </div>
      </div>
    </div>

    <!-- Separatore -->
    <div class="my-8 border-t border-gray-800"></div>

    <!-- Sezione Inferiore -->
    <div class="flex flex-col items-center justify-between space-y-4 md:flex-row md:space-y-0">
      <!-- Fatto con Amore -->
      <div class="flex items-center space-x-2 text-gray-300">
        <span>Fatto con</span>
        <Heart class="h-4 w-4 fill-current text-red-500" />
        <span>da</span>
        <a
          href="/about"
          class="font-medium text-white transition-colors hover:text-blue-400"
        >
          Antonio Sarro & Giovanni Rapa
        </a>
      </div>

      <!-- Copyright e Version -->
      <div class="text-center text-gray-400 md:text-right">
        <div class="text-sm">
          © {currentYear} Saint Tracker. Tutti i diritti riservati.
        </div>
        <div class="text-xs text-gray-500 mt-1">
          {version}
        </div>
      </div>
    </div>

    <!-- Avviso Legale Aggiuntivo -->
    <div class="mt-4 text-center text-xs text-gray-500">
      <p>
        Saint Tracker è impegnato nella privacy e protezione dei dati.
        <a href="/privacy" class="underline hover:text-gray-300">Scopri di più</a>
      </p>
    </div>
  </div>
</footer>