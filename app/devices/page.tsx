import { redirect } from "next/navigation"
import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { AppShell } from "@/components/app-shell"
import { DeviceList } from "@/components/device-list"
import { AddDeviceForm } from "@/components/add-device-form"
import { getDevices } from "@/app/actions/devices"

export default async function DevicesPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) redirect("/sign-in")

  const devices = await getDevices()
  const online = devices.filter((d) => d.isOnline).length

  return (
    <AppShell userName={session.user.name}>
      <div className="flex flex-col gap-5">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Connected devices</h1>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground text-pretty">
            {devices.length > 0
              ? `${devices.length} device${devices.length === 1 ? "" : "s"} tracked, ${online} currently online. Tap the pencil to assign a name.`
              : "Track every device on your network and give each one a friendly name."}
          </p>
        </div>

        <DeviceList devices={devices} />
        <AddDeviceForm />
      </div>
    </AppShell>
  )
}
