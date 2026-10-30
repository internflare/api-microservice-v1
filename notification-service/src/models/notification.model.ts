import { randomUUID } from "node:crypto";
import mongoose, { Schema, Types } from "mongoose";
import { notificationTypes, type NotificationType } from "../services/email-notification.service.js";

export type NotificationChannel = "email" | "in_app";

export interface NotificationRecord {
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
  dedupe_key?: "welcome";
}

interface NotificationDocument extends Omit<NotificationRecord, "user_id"> {
  user_id: Types.ObjectId;
  dedupe_key?: "welcome";
}

const notificationSchema = new Schema<NotificationDocument>(
  {
    id: { type: String, required: true, unique: true },
    user_id: { type: Schema.Types.ObjectId, ref: "user", required: true },
    type: {
      type: String,
      required: true,
      enum: notificationTypes,
    },
    title: { type: String, required: true },
    body: { type: String, required: true },
    link: { type: String, default: null },
    channel: { type: String, required: true, enum: ["email", "in_app"] },
    read_at: { type: Date, default: null },
    created_at: { type: Date, required: true, default: Date.now },
    dedupe_key: { type: String, select: false },
  },
  { versionKey: false, id: false },
);

notificationSchema.index(
  { user_id: 1, created_at: -1 },
  { name: "notifications_user_created_idx" },
);
notificationSchema.index(
  { user_id: 1, created_at: -1 },
  {
    partialFilterExpression: { read_at: null },
    name: "notifications_unread_user_idx",
  },
);
notificationSchema.index(
  { user_id: 1 },
  {
    unique: true,
    partialFilterExpression: { dedupe_key: "welcome" },
    name: "one_welcome_notification_per_user",
  },
);

export const Notification =
  mongoose.models.Notification ??
  mongoose.model<NotificationDocument>("Notification", notificationSchema);

function toNotificationRecord(
  notification: NotificationDocument,
): NotificationRecord {
  return {
    id: notification.id,
    user_id: String(notification.user_id),
    type: notification.type,
    title: notification.title,
    body: notification.body,
    link: notification.link,
    channel: notification.channel,
    read_at: notification.read_at,
    created_at: notification.created_at,
  };
}

export async function findNotificationById(
  id: string,
): Promise<NotificationRecord | undefined> {
  const notification = await Notification.findOne({ id }).exec();
  return notification ? toNotificationRecord(notification) : undefined;
}

export async function createNotification(
  notification: NewNotification,
): Promise<NotificationRecord> {
  const created = await Notification.create({
    ...notification,
    id: notification.id ?? randomUUID(),
    link: notification.link ?? null,
  });
  return toNotificationRecord(created);
}

export async function checkDatabaseConnection(): Promise<void> {
  if (mongoose.connection.readyState !== 1) {
    throw new Error("MongoDB is not connected");
  }
}
