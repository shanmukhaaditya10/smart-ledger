import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/session";
import { currentMonthKey, isMonthKey } from "@/lib/date";
import {
  buildMonthlyReport,
  reportHtml,
  reportSubject,
  reportText,
} from "@/lib/report";
import { sendEmail, isEmailConfigured, type SendResult } from "@/lib/email";
import { json, errorResponse } from "@/lib/http";

// POST /api/summary/email?month=YYYY-MM — build the month report, email it if
// SMTP is configured (env-gated), and always drop a MONTH_SUMMARY in-app
// notification. In production you'd schedule this via a job runner.
export async function POST(request: NextRequest) {
  try {
    const userId = await requireUserId();
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const monthParam = request.nextUrl.searchParams.get("month");
    const month = monthParam && isMonthKey(monthParam) ? monthParam : currentMonthKey();

    const report = await buildMonthlyReport(userId, month);
    const subject = reportSubject(report);

    let emailResult: SendResult = { sent: false, reason: "Email not configured" };
    if (isEmailConfigured()) {
      emailResult = await sendEmail({
        to: user.email,
        subject,
        text: reportText(report),
        html: reportHtml(report),
      });
    }

    // In-app MONTH_SUMMARY notification (deduped per month).
    try {
      await prisma.notification.create({
        data: {
          userId,
          kind: "MONTH_SUMMARY",
          message: subject,
          dedupeKey: `summary:${month}:${Date.now()}`,
        },
      });
    } catch {
      // ignore dedupe collisions
    }

    return json({ month, subject, email: emailResult, report });
  } catch (err) {
    return errorResponse(err);
  }
}
