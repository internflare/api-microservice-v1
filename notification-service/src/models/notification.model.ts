import type { QueryResultRow } from "pg";
import { database } from "../db/pool.js";
import type { NotificationType } from "../services/email-notification.service.js";

export type NotificationChannel = "email" | "in_app";

export interface NotificationRecord extends QueryResultRow {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  body: string;
  link: string | null;
  channel: NotificationChannel;
  read_at: Date | null;
  created_at: Date;
}

export interface NewNotification {
  id?: string;
  user_id: string;
  type: NotificationType;
  title: string;
  body: string;
  link?: string | null;
  channel: NotificationChannel;
}

// Return a previously saved record so RabbitMQ redeliveries don't resend welcome emails.
export async function findNotificationById(
  id: string,
): Promise<NotificationRecord | undefined> {
  const result = await database.query<NotificationRecord>(
    `SELECT id, user_id, type, title, body, link, channel, read_at, created_at
     FROM notifications
     WHERE id = $1`,
    [id],
  );
  return result.rows[0];
}

// Persist notification content using parameterized SQL and return the database record.
export async function createNotification(
  notification: NewNotification,
): Promise<NotificationRecord> {
  const result = await database.query<NotificationRecord>(
    `INSERT INTO notifications (
       id, user_id, type, title, body, link, channel
     )
     VALUES (
       COALESCE($1::uuid, gen_random_uuid()), $2, $3, $4, $5, $6, $7
     )
     RETURNING id, user_id, type, title, body, link, channel, read_at, created_at`,
    [
      notification.id ?? null,
      notification.user_id,
      notification.type,
      notification.title,
      notification.body,
      notification.link ?? null,
      notification.channel,
    ],
  );

  const record = result.rows[0];
  if (!record) {
    throw new Error("PostgreSQL did not return the inserted notification");
  }
  return record;
}

// Used by the health route to verify actual database connectivity.
export async function checkDatabaseConnection(): Promise<void> {
  await database.query("SELECT 1");
}
