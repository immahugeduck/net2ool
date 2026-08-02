import { redirect } from "next/navigation"
import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { AppShell } from "@/components/app-shell"
import { SettingsForm } from "@/components/settings-form"
import { AgentKeys } from "@/components/agent-keys"
import { getSettings } from "@/app/actions/speedtest"
import { getAgentKeys } from "@/app/actions/agent"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export default async function SettingsPage() {
  const requestHeaders = await headers()
  const session = await auth.api.getSession({ headers: requestHeaders })
  if (!session?.user) redirect("/sign-in")

  const [settings, keys] = await Promise.all([getSettings(), getAgentKeys()])

  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000"
  const proto = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https")
  const ingestUrl = `${proto}://${host}/api/agent/ingest`

  return (
    <AppShell userName={session.user.name}>
      <div className="flex flex-col gap-5">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Settings</h1>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground text-pretty">
            Signed in as {session.user.email}
          </p>
        </div>

        <SettingsForm
          downloadSeconds={settings.downloadSeconds}
          uploadSeconds={settings.uploadSeconds}
          parallelStreams={settings.parallelStreams}
        />

        <AgentKeys keys={keys} ingestUrl={ingestUrl} />

        <Card>
          <CardHeader>
            <CardTitle className="text-base">What the browser cannot do</CardTitle>
            <CardDescription>Stated plainly, so the numbers you see are never misleading.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-xs leading-relaxed text-muted-foreground">
            <Limitation
              title="Simultaneous Wi-Fi and cellular tests"
              body="An operating system routes traffic over one active interface, and no browser API can bind a request to a specific radio. net2ool pairs sequential runs instead."
            />
            <Limitation
              title="Device-wide data usage"
              body="Browsers cannot read OS byte counters. The web app records only the traffic it generates; the Android agent reads real per-app totals via NetworkStatsManager."
            />
            <Limitation
              title="LAN and radio scanning"
              body="There is no browser Wi-Fi scanning API, and Web Bluetooth only offers a user-driven device picker, never a passive scan. Discovery requires the Android agent."
            />
          </CardContent>
        </Card>
      </div>
    </AppShell>
  )
}

function Limitation({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex flex-col gap-0.5 border-l-2 border-border pl-3">
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="text-pretty">{body}</p>
    </div>
  )
}
