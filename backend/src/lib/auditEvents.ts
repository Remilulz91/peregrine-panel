import { db } from './db';

/**
 * Audit event log (v0.34.0+). Separate from auth_events (auth only)
 * and server_activity (user-visible actions) — this captures every
 * sensitive backend operation for forensic reconstruction if the
 * panel is compromised. The events live forever (no automatic
 * pruning); an operator who wants to trim can DELETE FROM audit_events
 * WHERE created_at < '...' manually.
 */
export type AuditEventKind =
  | 'audit.backup_download'      // a backup .tar.gz was downloaded
  | 'audit.file_write'           // a file in a server data dir was written
  | 'audit.file_delete'          // a file or directory was deleted
  | 'audit.rcon_command'         // an RCON command was sent
  | 'audit.subuser_perm_change'  // a subuser's permission set was updated
  | 'audit.docker_exec'          // docker exec was called (other than RCON list)
  | (string & {});

export interface AuditEventInput {
  kind: AuditEventKind;
  actorId?: string | null;
  serverId?: string | null;
  remoteIp?: string | null;
  details?: string | null;
}

/** Inserts one row into `audit_events`. Never throws. */
export function logAuditEvent(input: AuditEventInput): void {
  try {
    db.prepare(
      `INSERT INTO audit_events (kind, actor_id, server_id, remote_ip, details)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(
      input.kind,
      input.actorId ?? null,
      input.serverId ?? null,
      input.remoteIp ?? null,
      (input.details ?? '').slice(0, 500) || null,
    );
  } catch {
    // Logging must never block the actual operation.
  }
}
