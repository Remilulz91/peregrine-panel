/**
 * Mod-loader ✕ plugin-API → server-binary resolution matrix (v0.43.0+).
 *
 * A Minecraft Java server is one process that loads one main class.
 * "Forge + Paper" doesn't exist because no one ships a binary that
 * implements both APIs simultaneously. What DOES exist is a handful
 * of community-maintained binaries that bake the Bukkit API on top
 * of a mod loader — Mohist (Forge), Arclight (Forge & NeoForge),
 * Banner (Fabric). This module turns the user's two-dropdown choice
 * ("which mods?" + "which plugins?") into one of those binaries,
 * deterministically, with explicit invalid-combination handling.
 *
 * The function is intentionally tiny and total: every (modLoader,
 * pluginApi) pair either resolves to a `ServerLoader` or returns
 * `null` so the UI can disable Create / show a helpful error.
 */

import type { ServerLoader } from './api';

/** What the user picks in the LEFT dropdown ("which mods?"). */
export type ModLoader =
  | 'none'
  | 'fabric'
  | 'quilt'
  | 'forge'
  | 'neoforge';

/** What the user picks in the RIGHT dropdown ("which plugins?"). */
export type PluginApi =
  | 'none'
  | 'paper'
  | 'purpur'
  | 'folia'
  | 'spigot'
  | 'bukkit';

/**
 * The list of every UI-pickable mod loader, in display order. NONE
 * is first so a fresh dialog shows "no mods" by default.
 */
export const MOD_LOADERS: ModLoader[] = [
  'none',
  'fabric',
  'quilt',
  'forge',
  'neoforge',
];

/** The plugin-API options, in display order. */
export const PLUGIN_APIS: PluginApi[] = [
  'none',
  'paper',
  'purpur',
  'folia',
  'spigot',
  'bukkit',
];

/**
 * Resolves a `(modLoader, pluginApi)` choice to the actual server
 * binary the panel will instantiate. Returns `null` for combinations
 * that nobody has shipped a hybrid for (e.g. Forge + Paper). The
 * caller is expected to disable the Create button and show an
 * explanatory message when this returns null.
 *
 * Defaults documented here, not changed without thinking:
 *
 *   - Forge + Bukkit → **Arclight**, NOT Mohist. Both exist; Arclight
 *     is the actively-maintained successor as of mid-2026. Users who
 *     specifically want Mohist can still pick it via the Settings
 *     page on an existing server (where the saved loader is loaded
 *     as-is rather than re-resolved).
 *   - NeoForge + Bukkit → **Arclight**, same reasoning.
 *   - Fabric + Bukkit → **Banner**.
 *   - Quilt + anything-but-none → **null** (no hybrid exists).
 *   - Any mod loader + Paper/Purpur/Folia/Spigot → **null** (no
 *     binary combines a mod loader with the Paper-family Bukkit
 *     successor; "Bukkit" is the lowest-common-denominator that the
 *     hybrids actually re-implement).
 */
export function resolveLoader(
  modLoader: ModLoader,
  pluginApi: PluginApi,
): ServerLoader | null {
  // No mods, no plugins → pure Vanilla.
  if (modLoader === 'none' && pluginApi === 'none') return 'vanilla';

  // Plugins only, no mods: the picked API IS the binary.
  if (modLoader === 'none') {
    return pluginApi as ServerLoader; // paper / purpur / folia / spigot / bukkit
  }

  // Mods only, no plugins: the picked mod loader IS the binary.
  if (pluginApi === 'none') {
    return modLoader as ServerLoader; // fabric / quilt / forge / neoforge
  }

  // Mods + plugins — only the Bukkit-API hybrids exist.
  if (pluginApi !== 'bukkit') {
    return null;
  }
  switch (modLoader) {
    case 'fabric':
      return 'banner';
    case 'forge':
    case 'neoforge':
      return 'arclight';
    case 'quilt':
      // No widely-deployed Quilt + Bukkit hybrid as of mid-2026.
      return null;
  }
}

/**
 * Inverse of `resolveLoader` — used by the Settings page to render
 * an existing server's two dropdowns from its stored
 * `loader: ServerLoader` field. For hybrids the answer is the
 * "canonical" pairing the binary represents (Mohist and Arclight
 * both render as Forge + Bukkit, even though Arclight also handles
 * NeoForge; we pick the dropdown values that make sense for the
 * average user and don't bother with a third dropdown for the
 * Forge-vs-NeoForge ambiguity).
 */
export function splitLoader(
  loader: ServerLoader,
): { modLoader: ModLoader; pluginApi: PluginApi } {
  switch (loader) {
    case 'vanilla':
      return { modLoader: 'none', pluginApi: 'none' };
    case 'paper':
      return { modLoader: 'none', pluginApi: 'paper' };
    case 'purpur':
      return { modLoader: 'none', pluginApi: 'purpur' };
    case 'folia':
      return { modLoader: 'none', pluginApi: 'folia' };
    case 'spigot':
      return { modLoader: 'none', pluginApi: 'spigot' };
    case 'bukkit':
      return { modLoader: 'none', pluginApi: 'bukkit' };
    case 'fabric':
      return { modLoader: 'fabric', pluginApi: 'none' };
    case 'quilt':
      return { modLoader: 'quilt', pluginApi: 'none' };
    case 'forge':
      return { modLoader: 'forge', pluginApi: 'none' };
    case 'neoforge':
      return { modLoader: 'neoforge', pluginApi: 'none' };
    case 'banner':
      return { modLoader: 'fabric', pluginApi: 'bukkit' };
    case 'mohist':
    case 'arclight':
      return { modLoader: 'forge', pluginApi: 'bukkit' };
  }
}

/**
 * True iff the resolved binary is a "mods + plugins" hybrid. The UI
 * uses this to show a warning callout — these binaries are
 * community-maintained, not endorsed by Paper or Forge upstream, and
 * a small fraction of plugins / mods may misbehave under them.
 */
export const HYBRID_LOADERS: ReadonlySet<ServerLoader> = new Set<ServerLoader>([
  'mohist',
  'arclight',
  'banner',
]);
