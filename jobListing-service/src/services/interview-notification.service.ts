import type { ApplicationRecord } from "../models/application.model.js";
import type { InterviewRecord } from "../models/interview.model.js";
import type { OpportunityRecord } from "../models/opportunity.model.js";
import { findHiringContacts, findUserContact } from "../utils/helperFunc.js";
import { logger } from "../utils/logger.js";
import {
  publishInterviewNotice,
  type InterviewNoticeKind,
} from "./notification-publisher.service.js";

const TALENT_KINDS: InterviewNoticeKind[] = ["requested", "rescheduled", "cancelled"];

// Emails the other side of an interview change. Best effort: a mail failure never fails the request.
async function notifyInterviewChange(
  kind: InterviewNoticeKind,
  interview: InterviewRecord,
  application: ApplicationRecord,
  opportunity: OpportunityRecord,
  actorName: string,
): Promise<void> {
  try {
    const toTalent = TALENT_KINDS.includes(kind);
    const talent = await findUserContact(application.talent_id);
    const recipients = toTalent
      ? talent
        ? [talent]
        : []
      : await findHiringContacts(opportunity.company_id, interview.requested_by);
    if (recipients.length === 0) {
      logger("warn", `No recipient for interview ${interview.id} (${kind})`);
      return;
    }
    const notice = {
      kind,
      interviewId: interview.id,
      applicationId: application.id,
      opportunityTitle: opportunity.title,
      companyName: opportunity.external_company_name ?? "the hiring team",
      otherPartyName: toTalent ? actorName : (talent?.name ?? "The candidate"),
      scheduledAt: interview.scheduled_at.toISOString(),
      format: interview.format,
      meetingUrl: interview.meeting_url ?? undefined,
      message: (toTalent ? interview.message : interview.reschedule_reason) ?? undefined,
      audience: toTalent ? ("talent" as const) : ("employer" as const),
    };
    await Promise.all(recipients.map((recipient) => publishInterviewNotice(notice, recipient)));
  } catch (error) {
    logger("warn", `Interview ${interview.id} ${kind} notification failed: ${String(error)}`);
  }
}

export { notifyInterviewChange };
