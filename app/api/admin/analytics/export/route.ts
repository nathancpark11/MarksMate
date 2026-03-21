import ExcelJS from "exceljs";
import { isGuidanceAdminUsername } from "@/lib/admin";
import { getAdminAnalyticsSnapshot } from "@/lib/analytics/service";
import { requireSessionUser } from "@/lib/auth";
import { enforceRateLimits } from "@/lib/rateLimit";
import { getRequestId, logApiError, logApiRequestMetadata } from "@/lib/safeLogging";

export const runtime = "nodejs";

function toUsd(value: number) {
  return Number(value.toFixed(6));
}

export async function GET(req: Request) {
  const routeName = "/api/admin/analytics/export";
  const requestId = getRequestId(req);

  try {
    const { user, response } = await requireSessionUser();
    if (response || !user) {
      return response ?? Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!isGuidanceAdminUsername(user.username)) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    const rateLimitResponse = enforceRateLimits(req, [
      {
        key: "admin-analytics-export-per-hour",
        maxRequests: 6,
        windowMs: 60 * 60 * 1000,
        errorMessage: "Admin analytics export limit reached.",
      },
    ]);
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    const snapshot = await getAdminAnalyticsSnapshot({ maskEmails: true });

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Bullet Proof";
    workbook.created = new Date();

    const userSheet = workbook.addWorksheet("User Summary");
    userSheet.columns = [
      { header: "User ID", key: "userId", width: 38 },
      { header: "Email/Identifier", key: "identifier", width: 28 },
      { header: "Rank", key: "rank", width: 14 },
      { header: "Rate", key: "rate", width: 28 },
      { header: "Date Joined", key: "dateJoined", width: 22 },
      { header: "Active Status", key: "activeStatus", width: 14 },
      { header: "Last Active Date", key: "lastActiveDate", width: 22 },
      { header: "Total Daily Logs", key: "totalDailyLogs", width: 16 },
      { header: "Total Generated Bullets", key: "totalGeneratedBullets", width: 22 },
      { header: "Total Committed Marks", key: "totalCommittedMarks", width: 20 },
      { header: "Total AI Calls", key: "totalAiCalls", width: 14 },
      { header: "Total Prompt Tokens", key: "totalPromptTokens", width: 18 },
      { header: "Total Completion Tokens", key: "totalCompletionTokens", width: 21 },
      { header: "Total Tokens", key: "totalTokens", width: 14 },
      { header: "Estimated AI Cost", key: "estimatedAiCostUsd", width: 18 },
      { header: "Average Cost Per Mark", key: "averageCostPerMarkUsd", width: 20 },
    ];

    for (const userRow of snapshot.userSummaries) {
      userSheet.addRow({
        ...userRow,
        estimatedAiCostUsd: toUsd(userRow.estimatedAiCostUsd),
        averageCostPerMarkUsd: toUsd(userRow.averageCostPerMarkUsd),
      });
    }

    const aggregateSheet = workbook.addWorksheet("Aggregate Metrics");
    aggregateSheet.columns = [
      { header: "Metric", key: "metric", width: 44 },
      { header: "Value", key: "value", width: 28 },
    ];

    aggregateSheet.addRows([
      { metric: "Total Users", value: snapshot.totals.totalUsers },
      { metric: "Active Users (30d)", value: snapshot.totals.activeUsers },
      { metric: "Average Bullets Per User", value: snapshot.totals.averageBulletsPerUser },
      { metric: "Average AI Calls Per User", value: snapshot.totals.averageAiCallsPerUser },
      { metric: "Average Tokens Per User", value: snapshot.totals.averageTokensPerUser },
      { metric: "Total Estimated AI Cost", value: toUsd(snapshot.totals.estimatedTotalAiCostUsd) },
      {
        metric: "Average Estimated Cost Per User",
        value: toUsd(snapshot.totals.estimatedAverageCostPerUserUsd),
      },
      {
        metric: "Average Estimated Cost Per Active User",
        value: toUsd(snapshot.totals.averageCostPerActiveUserUsd),
      },
    ]);

    aggregateSheet.addRow({ metric: "", value: "" });
    aggregateSheet.addRow({ metric: "Average Estimated Cost By Rank/Rate", value: "" });

    for (const row of snapshot.averageCostByRankRate) {
      aggregateSheet.addRow({
        metric: `${row.rank} / ${row.rate}`,
        value: toUsd(row.averageCostUsd),
      });
    }

    const monthlySheet = workbook.addWorksheet("Monthly Trends");
    monthlySheet.columns = [
      { header: "Month", key: "month", width: 14 },
      { header: "New Users", key: "newUsers", width: 12 },
      { header: "Active Users", key: "activeUsers", width: 12 },
      { header: "Bullets Generated", key: "bulletsGenerated", width: 18 },
      { header: "Committed Marks", key: "committedMarks", width: 16 },
      { header: "AI Calls", key: "aiCalls", width: 12 },
      { header: "Total Tokens", key: "totalTokens", width: 14 },
      { header: "Estimated Cost", key: "estimatedCostUsd", width: 16 },
    ];

    for (const row of snapshot.monthlyTrends) {
      monthlySheet.addRow({
        ...row,
        estimatedCostUsd: toUsd(row.estimatedCostUsd),
      });
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const fileName = `admin-analytics-${new Date().toISOString().slice(0, 10)}.xlsx`;

    logApiRequestMetadata({ requestId, routeName, inputLength: 0, success: true, status: 200 });
    return new Response(buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error: unknown) {
    logApiError("Admin analytics export error", error, { requestId, routeName, success: false });
    logApiRequestMetadata({ requestId, routeName, inputLength: 0, success: false, status: 500 });
    return Response.json({ error: "Unable to export admin analytics right now." }, { status: 500 });
  }
}
