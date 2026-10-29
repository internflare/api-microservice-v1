import mongoose, { Schema } from "mongoose";

const talentProfileSchema = new Schema(
  {
    user_id: { type: String, required: true, unique: true },
    full_name: { type: String, default: null },
    phone: { type: String, default: null },
    country: { type: String, default: null },
    location: { type: String, default: null },
    headline: { type: String, default: null },
    education: { type: [Schema.Types.Mixed], default: [] },
    experience: { type: [Schema.Types.Mixed], default: [] },
    skills: { type: [String], default: [] },
    preferred_roles: { type: [String], default: [] },
    availability: { type: String, default: null },
    work_arrangement_pref: { type: String, default: null },
    career_goals: { type: String, default: null },
    cv_url: { type: String, default: null },
    avatar_url: { type: String, default: null },
    profile_completeness: { type: Number, default: 0 },
    readiness_score: { type: Number, default: 0 },
  },
  {
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
    toJSON: {
      transform: (_doc, value: any) => {
        value.id = String(value._id);
        delete value._id;
        delete value.__v;
        return value;
      },
    },
    toObject: {
      transform: (_doc, value: any) => {
        value.id = String(value._id);
        delete value._id;
        delete value.__v;
        return value;
      },
    },
  },
);

export const TalentProfileDocument = mongoose.models.TalentProfile ?? mongoose.model("TalentProfile", talentProfileSchema);


