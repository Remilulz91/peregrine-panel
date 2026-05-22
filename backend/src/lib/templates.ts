import { randomUUID } from 'node:crypto';
import { db } from './db';

/** A game template: describes how to run a given game. */
export interface GameTemplate {
  id: string;
  name: string;
  dockerImage: string;
  defaultVersion: string;
}

interface TemplateRow {
  id: string;
  name: string;
  docker_image: string;
  default_version: string;
}

function toTemplate(row: TemplateRow): GameTemplate {
  return {
    id: row.id,
    name: row.name,
    dockerImage: row.docker_image,
    defaultVersion: row.default_version,
  };
}

// The game templates Peregrine ships with. More can be added in later
// phases (Minecraft Bedrock, etc.) simply by extending this list.
const BUILT_IN_TEMPLATES = [
  {
    name: 'Minecraft Java',
    dockerImage: 'itzg/minecraft-server',
    defaultVersion: 'LATEST',
  },
];

/** Inserts the built-in templates that are not already in the database. */
export function seedTemplates(): void {
  for (const template of BUILT_IN_TEMPLATES) {
    const existing = db
      .prepare('SELECT id FROM game_templates WHERE name = ?')
      .get(template.name);
    if (!existing) {
      db.prepare(
        `INSERT INTO game_templates (id, name, docker_image, default_version)
         VALUES (?, ?, ?, ?)`,
      ).run(
        randomUUID(),
        template.name,
        template.dockerImage,
        template.defaultVersion,
      );
    }
  }
}

/** Lists every available game template. */
export function listTemplates(): GameTemplate[] {
  const rows = db
    .prepare('SELECT * FROM game_templates ORDER BY name')
    .all() as unknown as TemplateRow[];
  return rows.map(toTemplate);
}

/** Finds a game template by id, or returns null. */
export function getTemplate(id: string): GameTemplate | null {
  const row = db
    .prepare('SELECT * FROM game_templates WHERE id = ?')
    .get(id) as TemplateRow | undefined;
  return row ? toTemplate(row) : null;
}
