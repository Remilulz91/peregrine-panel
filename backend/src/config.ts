import path from 'node:path';
import dotenv from 'dotenv';

// Charge les variables d'un fichier .env situe a la racine du depot,
// s'il existe. En production (Docker), les variables sont fournies
// directement par docker-compose : ce chargement est alors sans effet.
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

/** Lit une variable d'environnement numerique, avec une valeur par defaut. */
function readNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  const parsed = raw !== undefined ? Number(raw) : NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** Configuration centrale de l'application, lue depuis l'environnement. */
export const config = {
  /** Port d'ecoute du serveur HTTP. */
  port: readNumber('PORT', 3000),

  /** Interface reseau. 0.0.0.0 pour que cela fonctionne dans Docker. */
  host: process.env.HOST ?? '0.0.0.0',

  /** Environnement d'execution : "development" ou "production". */
  nodeEnv: process.env.NODE_ENV ?? 'development',

  /** URL publique a laquelle le panel est joignable. */
  appUrl: process.env.APP_URL ?? 'http://localhost:3000',

  /** Vrai lorsque l'on execute la version de production. */
  get isProduction(): boolean {
    return this.nodeEnv === 'production';
  },
};
