import { z } from "zod";

export const inviteTokenSchema = z.string().trim().min(20).max(200);

export const inviteSignupSchema = z.object({
  token: inviteTokenSchema,
  name: z.string().trim().min(2, "Enter your full name").max(120),
  password: z.string().min(8, "Password must be at least 8 characters").max(128),
});
