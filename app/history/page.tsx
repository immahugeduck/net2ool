import { redirect } from "next/navigation"
import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { AppShell } from "@/components/app-shell"
import { HistoryList } from "@/components/history-list"
import { getRecentTests } from "@/app/actions/speedtest"

export default async function HistoryPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) redirect("/sign-in")

  const tests = await getRecentTests(100)

  return (
    <AppShell userName={session.user.name}>
      <div className="flex flex-col gap-5">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Test log</h1>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground text-pretty">
            {tests.length > 0
              ? `${tests.length} run${tests.length === 1 ? "" : "s"} recorded. Export as CSV for reporting.`
              : "Every completed speed test is saved here automatically."}
          </p>
        </div>

        <HistoryList tests={tests} />
      </div>
    </AppShell>
  )
}
