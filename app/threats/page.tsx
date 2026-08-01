import { redirect } from "next/navigation"
import { headers } from "next/headers"
import Link from "next/link"
import { Smartphone } from "lucide-react"
import { auth } from "@/lib/auth"
import { AppShell } from "@/components/app-shell"
import { ThreatPanel } from "@/components/threat-panel"
import { getThreats } from "@/app/actions/threats"
import { Card, CardContent } from "@/components/ui/card"

export default async function ThreatsPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) redirect("/sign-in")

  const threats = await getThreats()

  return (
    <AppShell userName={session.user.name}>
      <div className="flex flex-col gap-5">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Threat detection</h1>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground text-pretty">
            Findings are only shown when something is actually detected. Nothing here is simulated.
          </p>
        </div>

        <ThreatPanel threats={threats} />

        <Card>
          <CardContent className="flex items-start gap-3 py-4">
            <Smartphone className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <div className="flex flex-col gap-1">
              <p className="text-sm font-medium">Camera and Bluetooth scanning</p>
              <p className="text-xs leading-relaxed text-muted-foreground text-pretty">
                Detecting nearby cameras and recorders requires radio access that browsers do not expose. The Android
                agent performs BLE scans, Wi-Fi access point scans, and LAN port fingerprinting, then reports findings
                here.
              </p>
              <Link
                href="/settings"
                className="mt-1 self-start text-xs text-primary underline-offset-4 hover:underline"
              >
                Set up the agent
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  )
}
