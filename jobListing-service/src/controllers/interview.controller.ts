import type { RequestHandler } from "express";
import {
  listApplicationsForCompany,
  listApplicationsForTalent,
  updateApplication,
  type ApplicationRecord,
} from "../models/application.model.js";
import {
  createInterview,
  findInterviewById,
  listInterviewsForApplication,
  listInterviewsForApplications,
  updateInterview,
  type InterviewPatch,
} from "../models/interview.model.js";
import {
  loadApplicationWithListing,
  parseApplicationId,
  requireListingAdmin,
} from "../services/application-access.service.js";
import { loadApplicantProfiles } from "../services/application.service.js";
import { notifyInterviewChange } from "../services/interview-notification.service.js";
import { AppError } from "../utils/appError.js";
import { forwardError } from "../utils/forward-error.js";
import { parseOrFail } from "../utils/parse-or-fail.js";
import { STAGE_TRANSITIONS } from "../validators/application.validator.js";
import {
  OPEN_INTERVIEW_STATUSES,
  companyInterviewsQuerySchema,
  createInterviewSchema,
  respondInterviewSchema,
  updateInterviewSchema,
} from "../validators/interview.validator.js";
import { requireUserId } from "../validators/opportunity.validator.js";

// Stages from which an employer may invite a candidate to interview.
const INTERVIEWABLE_STAGES: ApplicationRecord["current_stage"][] = [
  "Reviewed",
  "Shortlisted",
  "Interview",
  "Test Task",
];

const isOpen = (status: string): boolean =>
  (OPEN_INTERVIEW_STATUSES as string[]).includes(status);

// Loads an interview with its application and listing.
const loadInterviewContext = async (id: unknown) => {
  const interview = await findInterviewById(parseApplicationId(id));
  if (!interview) throw new AppError("Interview not found", 404);
  const { application, opportunity } = await loadApplicationWithListing(interview.application_id);
  return { interview, application, opportunity };
};

// POST /applications/:id/interviews: a company admin invites the applicant to interview.
const createInterviewHandler: RequestHandler = async (request, response, next) => {
  try {
    const userId = requireUserId(request);
    const body = parseOrFail(createInterviewSchema.safeParse(request.body), "Invalid interview");
    const { application, opportunity } = await loadApplicationWithListing(request.params.id);
    await requireListingAdmin(opportunity.company_id, userId);

    if (!INTERVIEWABLE_STAGES.includes(application.current_stage)) {
      throw new AppError(
        `Move the application to Reviewed or Shortlisted before scheduling (currently ${application.current_stage})`,
        409,
      );
    }
    const existing = await listInterviewsForApplication(application.id);
    if (existing.some((item) => isOpen(item.status))) {
      throw new AppError("This candidate already has an open interview; reschedule or cancel it", 409);
    }

    const interview = await createInterview({
      applicationId: application.id,
      requestedBy: userId,
      scheduledAt: body.scheduled_at,
      format: body.format,
      meetingUrl: body.meeting_url || null,
      message: body.message || null,
    });
    if (
      application.current_stage !== "Interview" &&
      STAGE_TRANSITIONS[application.current_stage].includes("Interview")
    ) {
      await updateApplication(application.id, { current_stage: "Interview" });
    }
    await notifyInterviewChange(
      "requested",
      interview,
      application,
      opportunity,
      request.user?.name ?? "The hiring team",
    );
    response.status(201).json({ interview });
  } catch (error) {
    forwardError(error, next, "Failed to create interview:", "Could not schedule interview");
  }
};

// GET /applications/:id/interviews: the applicant or a company admin.
const listApplicationInterviewsHandler: RequestHandler = async (request, response, next) => {
  try {
    const userId = requireUserId(request);
    const { application, opportunity } = await loadApplicationWithListing(request.params.id);
    if (application.talent_id !== userId) {
      await requireListingAdmin(opportunity.company_id, userId);
    }
    response.json({ data: await listInterviewsForApplication(application.id) });
  } catch (error) {
    forwardError(error, next, "Failed to list interviews:", "Could not list interviews");
  }
};

// GET /interviews/mine: the signed-in talent's interviews with listing and company details.
const listMyInterviewsHandler: RequestHandler = async (request, response, next) => {
  try {
    const userId = requireUserId(request);
    const applications = await listApplicationsForTalent(userId);
    const byId = new Map(applications.map((application) => [application.id, application]));
    const interviews = await listInterviewsForApplications([...byId.keys()]);
    response.json({
      data: interviews.map((interview) => {
        const listing = byId.get(interview.application_id)?.opportunity;
        return {
          ...interview,
          listing_id: listing?.id ?? null,
          listing_title: listing?.title ?? null,
          company_id: listing?.company_id ?? null,
          company_name: listing?.company_name ?? null,
          company_logo_url: listing?.company_logo_url ?? null,
        };
      }),
    });
  } catch (error) {
    forwardError(error, next, "Failed to list my interviews:", "Could not list interviews");
  }
};

// GET /interviews?company_id=...: every interview across a company's applicants.
const listCompanyInterviewsHandler: RequestHandler = async (request, response, next) => {
  try {
    const userId = requireUserId(request);
    const query = parseOrFail(
      companyInterviewsQuerySchema.safeParse(request.query),
      "Invalid interviews query",
    );
    await requireListingAdmin(query.company_id, userId);
    const { applications, titles } = await listApplicationsForCompany(query.company_id, {});
    const byId = new Map(applications.map((application) => [application.id, application]));
    const [interviews, profiles] = await Promise.all([
      listInterviewsForApplications([...byId.keys()]),
      loadApplicantProfiles(applications.map((application) => application.talent_id)),
    ]);
    response.json({
      data: interviews.map((interview) => {
        const application = byId.get(interview.application_id);
        return {
          ...interview,
          listing_title: application ? (titles.get(application.opportunity_id) ?? null) : null,
          applicant_id: application?.talent_id ?? null,
          applicant_name: application
            ? (profiles.get(application.talent_id)?.full_name ?? "Applicant")
            : "Applicant",
        };
      }),
    });
  } catch (error) {
    forwardError(error, next, "Failed to list company interviews:", "Could not list interviews");
  }
};

// POST /interviews/:id/respond: the applicant confirms, declines or asks for another time.
const respondInterviewHandler: RequestHandler = async (request, response, next) => {
  try {
    const userId = requireUserId(request);
    const body = parseOrFail(respondInterviewSchema.safeParse(request.body), "Invalid response");
    const { interview, application, opportunity } = await loadInterviewContext(request.params.id);
    if (application.talent_id !== userId) throw new AppError("Interview not found", 404);
    if (!isOpen(interview.status) || interview.scheduled_at.getTime() < Date.now()) {
      throw new AppError("This interview can no longer be changed", 409);
    }

    const patch: InterviewPatch =
      body.response === "confirm"
        ? { status: "confirmed", reschedule_reason: null }
        : body.response === "decline"
          ? { status: "declined", reschedule_reason: body.reason ?? null }
          : { status: "reschedule_requested", reschedule_reason: body.reason ?? null };
    const updated = await updateInterview(interview.id, patch);
    if (!updated) throw new AppError("Interview not found", 404);

    const kind = { confirm: "confirmed", decline: "declined", reschedule: "reschedule_requested" }[
      body.response
    ] as "confirmed" | "declined" | "reschedule_requested";
    await notifyInterviewChange(kind, updated, application, opportunity, request.user?.name ?? "The candidate");
    response.json({ interview: updated });
  } catch (error) {
    forwardError(error, next, "Failed to respond to interview:", "Could not update interview");
  }
};

// PATCH /interviews/:id: a company admin reschedules, cancels, or records the outcome.
const updateInterviewHandler: RequestHandler = async (request, response, next) => {
  try {
    const userId = requireUserId(request);
    const body = parseOrFail(updateInterviewSchema.safeParse(request.body), "Invalid update");
    const { interview, application, opportunity } = await loadInterviewContext(request.params.id);
    await requireListingAdmin(opportunity.company_id, userId);

    const closing = body.status === "completed";
    if (closing ? interview.status === "cancelled" : !isOpen(interview.status)) {
      throw new AppError(`This interview is already ${interview.status}`, 409);
    }

    const { status, ...details } = body;
    const detailsChanged = ["scheduled_at", "format", "meeting_url", "message"].some(
      (key) => key in details,
    );
    const patch: InterviewPatch = {};
    if (status) patch.status = status;
    if (details.outcome !== undefined) patch.outcome = details.outcome;
    if (details.feedback !== undefined) patch.feedback = details.feedback;
    if (!status && detailsChanged) {
      if (details.scheduled_at) {
        patch.scheduled_at = details.scheduled_at;
        patch.status = "pending";
        patch.reschedule_reason = null;
      }
      if (details.format) patch.format = details.format;
      if (details.meeting_url !== undefined) patch.meeting_url = details.meeting_url || null;
      if (details.message !== undefined) patch.message = details.message || null;
    }

    const updated = await updateInterview(interview.id, patch);
    if (!updated) throw new AppError("Interview not found", 404);

    if (status === "cancelled" || (!status && detailsChanged)) {
      await notifyInterviewChange(
        status === "cancelled" ? "cancelled" : "rescheduled",
        updated,
        application,
        opportunity,
        request.user?.name ?? "The hiring team",
      );
    }
    response.json({ interview: updated });
  } catch (error) {
    forwardError(error, next, "Failed to update interview:", "Could not update interview");
  }
};

export {
  createInterviewHandler,
  listApplicationInterviewsHandler,
  listCompanyInterviewsHandler,
  listMyInterviewsHandler,
  respondInterviewHandler,
  updateInterviewHandler,
};
