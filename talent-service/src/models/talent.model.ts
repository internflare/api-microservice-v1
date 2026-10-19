import { pool } from "../db/pool.js";
import { calculateProfileCompleteness } from "../services/completeness.service.js";
import type {
  TalentProfile,
  TalentProfileInput,
  TalentSearchQuery,
} from "../types/talent.types.js";

function mapRowToTalentProfile(row: any): TalentProfile {
  return {
    id: row.id,
    user_id: row.user_id,
    full_name: row.full_name ?? null,
    phone: row.phone ?? null,
    country: row.country ?? null,
    location: row.location ?? null,
    headline: row.headline ?? null,
    education: typeof row.education === "string" ? JSON.parse(row.education) : (row.education ?? []),
    experience: typeof row.experience === "string" ? JSON.parse(row.experience) : (row.experience ?? []),
    skills: Array.isArray(row.skills) ? row.skills : [],
    preferred_roles: Array.isArray(row.preferred_roles) ? row.preferred_roles : [],
    availability: row.availability ?? null,
    work_arrangement_pref: row.work_arrangement_pref ?? null,
    career_goals: row.career_goals ?? null,
    cv_url: row.cv_url ?? null,
    profile_completeness: Number(row.profile_completeness ?? 0),
    readiness_score: Number(row.readiness_score ?? 0),
    created_at: new Date(row.created_at).toISOString(),
    updated_at: new Date(row.updated_at).toISOString(),
  };
}

export class TalentModel {
  static async findByUserId(userId: string): Promise<TalentProfile | null> {
    const query = `
      SELECT * FROM talent_profiles
      WHERE user_id = $1
      LIMIT 1
    `;
    const { rows } = await pool.query(query, [userId]);
    return rows.length > 0 ? mapRowToTalentProfile(rows[0]) : null;
  }

  static async findById(id: string): Promise<TalentProfile | null> {
    const query = `
      SELECT * FROM talent_profiles
      WHERE id = $1
      LIMIT 1
    `;
    const { rows } = await pool.query(query, [id]);
    return rows.length > 0 ? mapRowToTalentProfile(rows[0]) : null;
  }

  static async upsertProfile(
    userId: string,
    data: TalentProfileInput,
  ): Promise<TalentProfile> {
    // 1. Calculate completeness score
    const completeness = calculateProfileCompleteness(data);

    const query = `
      INSERT INTO talent_profiles (
        user_id,
        full_name,
        phone,
        country,
        location,
        headline,
        education,
        experience,
        skills,
        preferred_roles,
        availability,
        work_arrangement_pref,
        career_goals,
        cv_url,
        profile_completeness,
        readiness_score,
        updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9, $10, $11, $12, $13, $14, $15, $16, CURRENT_TIMESTAMP
      )
      ON CONFLICT (user_id) DO UPDATE SET
        full_name = EXCLUDED.full_name,
        phone = EXCLUDED.phone,
        country = EXCLUDED.country,
        location = EXCLUDED.location,
        headline = EXCLUDED.headline,
        education = EXCLUDED.education,
        experience = EXCLUDED.experience,
        skills = EXCLUDED.skills,
        preferred_roles = EXCLUDED.preferred_roles,
        availability = EXCLUDED.availability,
        work_arrangement_pref = EXCLUDED.work_arrangement_pref,
        career_goals = EXCLUDED.career_goals,
        cv_url = EXCLUDED.cv_url,
        profile_completeness = EXCLUDED.profile_completeness,
        readiness_score = EXCLUDED.readiness_score,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *;
    `;

    const values = [
      userId,
      data.full_name ?? null,
      data.phone ?? null,
      data.country ?? null,
      data.location ?? null,
      data.headline ?? null,
      JSON.stringify(data.education ?? []),
      JSON.stringify(data.experience ?? []),
      data.skills ?? [],
      data.preferred_roles ?? [],
      data.availability ?? null,
      data.work_arrangement_pref ?? null,
      data.career_goals ?? null,
      data.cv_url ?? null,
      completeness.score,
      0, // readiness_score initial
    ];

    const { rows } = await pool.query(query, values);
    return mapRowToTalentProfile(rows[0]);
  }

  static async updateProfile(
    userId: string,
    patch: Partial<TalentProfileInput>,
  ): Promise<TalentProfile> {
    const existing = await this.findByUserId(userId);
    if (!existing) {
      // If no profile exists yet, upsert as new
      return this.upsertProfile(userId, patch);
    }

    // Merge existing with patch
    const mergedData: TalentProfileInput = {
      full_name: patch.full_name !== undefined ? patch.full_name : existing.full_name,
      phone: patch.phone !== undefined ? patch.phone : existing.phone,
      country: patch.country !== undefined ? patch.country : existing.country,
      location: patch.location !== undefined ? patch.location : existing.location,
      headline: patch.headline !== undefined ? patch.headline : existing.headline,
      education: patch.education !== undefined ? patch.education : existing.education,
      experience: patch.experience !== undefined ? patch.experience : existing.experience,
      skills: patch.skills !== undefined ? patch.skills : existing.skills,
      preferred_roles: patch.preferred_roles !== undefined ? patch.preferred_roles : existing.preferred_roles,
      availability: patch.availability !== undefined ? patch.availability : existing.availability,
      work_arrangement_pref: patch.work_arrangement_pref !== undefined ? patch.work_arrangement_pref : existing.work_arrangement_pref,
      career_goals: patch.career_goals !== undefined ? patch.career_goals : existing.career_goals,
      cv_url: patch.cv_url !== undefined ? patch.cv_url : existing.cv_url,
    };

    return this.upsertProfile(userId, mergedData);
  }

  static async searchTalents(
    query: TalentSearchQuery,
  ): Promise<{ talents: TalentProfile[]; total: number }> {
    const conditions: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    // Filter by skills (PostgreSQL array containment: skills @> ARRAY['react'])
    if (query.skills && query.skills.length > 0) {
      conditions.push(`skills && $${paramIndex}`);
      values.push(query.skills);
      paramIndex++;
    }

    if (query.country) {
      conditions.push(`LOWER(country) = LOWER($${paramIndex})`);
      values.push(query.country);
      paramIndex++;
    }

    if (query.availability) {
      conditions.push(`availability = $${paramIndex}`);
      values.push(query.availability);
      paramIndex++;
    }

    if (query.work_arrangement_pref) {
      conditions.push(`work_arrangement_pref = $${paramIndex}`);
      values.push(query.work_arrangement_pref);
      paramIndex++;
    }

    if (query.min_completeness !== undefined) {
      conditions.push(`profile_completeness >= $${paramIndex}`);
      values.push(query.min_completeness);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    // Count total matches
    const countSql = `SELECT COUNT(*) AS total FROM talent_profiles ${whereClause}`;
    const { rows: countRows } = await pool.query(countSql, values);
    const total = Number(countRows[0]?.total ?? 0);

    // Fetch page items
    const limit = query.limit ?? 20;
    const offset = query.offset ?? 0;
    const selectSql = `
      SELECT * FROM talent_profiles
      ${whereClause}
      ORDER BY profile_completeness DESC, created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    const selectValues = [...values, limit, offset];

    const { rows } = await pool.query(selectSql, selectValues);
    return {
      talents: rows.map(mapRowToTalentProfile),
      total,
    };
  }

  static async deleteByUserId(userId: string): Promise<boolean> {
    const query = `DELETE FROM talent_profiles WHERE user_id = $1`;
    const result = await pool.query(query, [userId]);
    return (result.rowCount ?? 0) > 0;
  }
}
