"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Check, Pencil, ShieldCheck, Trash2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { deleteDevice, renameDevice, setDeviceTrusted } from "@/app/actions/devices"
import { formatRelativeTime } from "@/lib/format"
import { cn } from "@/lib/utils"

export interface DeviceRow {
  id: number
  macAddress: string
  ipAddress: string | null
  hostname: string | null
  customName: string | null
  vendor: string | null
  deviceType: string
  isOnline: boolean
  trusted: boolean
  source: string
  lastSeen: Date
}

export function DeviceList({ devices }: { devices: DeviceRow[] }) {
  if (devices.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
          <p className="text-sm font-medium">No devices yet</p>
          <p className="max-w-sm text-xs leading-relaxed text-muted-foreground text-pretty">
            A browser cannot scan your LAN. Add devices manually below, or install the Android agent to discover
            everything on the network automatically.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      {devices.map((device) => (
        <DeviceCard key={device.id} device={device} />
      ))}
    </div>
  )
}

function DeviceCard({ device }: { device: DeviceRow }) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(device.customName ?? "")
  const [pending, startTransition] = useTransition()

  const displayName = device.customName || device.hostname || device.vendor || "Unknown device"

  function save() {
    startTransition(async () => {
      try {
        await renameDevice(device.id, name)
        setEditing(false)
        toast.success("Device renamed")
        router.refresh()
      } catch {
        toast.error("Could not rename device")
      }
    })
  }

  function toggleTrust() {
    startTransition(async () => {
      await setDeviceTrusted(device.id, !device.trusted)
      router.refresh()
    })
  }

  function remove() {
    startTransition(async () => {
      await deleteDevice(device.id)
      toast.success("Device removed")
      router.refresh()
    })
  }

  return (
    <Card className="gap-0 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          {editing ? (
            <div className="flex items-center gap-1.5">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.nativeEvent.isComposing || e.keyCode === 229) return
                  if (e.key === "Enter") save()
                  if (e.key === "Escape") setEditing(false)
                }}
                placeholder="Living room TV"
                aria-label={`Name for ${device.macAddress}`}
                autoFocus
                className="h-8"
              />
              <Button size="icon-sm" onClick={save} disabled={pending} aria-label="Save name">
                <Check className="size-3.5" aria-hidden="true" />
              </Button>
              <Button size="icon-sm" variant="ghost" onClick={() => setEditing(false)} aria-label="Cancel">
                <X className="size-3.5" aria-hidden="true" />
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span
                className={cn("size-1.5 shrink-0 rounded-full", device.isOnline ? "bg-chart-1" : "bg-muted-foreground")}
                aria-hidden="true"
              />
              <span className="truncate text-sm font-medium">{displayName}</span>
              {device.trusted && (
                <ShieldCheck className="size-3.5 shrink-0 text-chart-1" aria-label="Trusted device" />
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] text-muted-foreground">
            <span>{device.macAddress}</span>
            {device.ipAddress && <span>{device.ipAddress}</span>}
            <span className="font-sans">{formatRelativeTime(device.lastSeen)}</span>
          </div>

          <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
            {device.vendor && (
              <Badge variant="secondary" className="text-[10px]">
                {device.vendor}
              </Badge>
            )}
            {device.deviceType !== "unknown" && (
              <Badge variant="outline" className="text-[10px] capitalize">
                {device.deviceType}
              </Badge>
            )}
            <Badge variant="outline" className="text-[10px]">
              {device.source === "agent" ? "discovered" : device.source}
            </Badge>
          </div>
        </div>

        {!editing && (
          <div className="flex shrink-0 items-center gap-0.5">
            <Button
              size="icon-sm"
              variant="ghost"
              onClick={() => setEditing(true)}
              aria-label={`Rename ${displayName}`}
            >
              <Pencil className="size-3.5" aria-hidden="true" />
            </Button>
            <Button
              size="icon-sm"
              variant="ghost"
              onClick={toggleTrust}
              aria-label={device.trusted ? `Untrust ${displayName}` : `Trust ${displayName}`}
            >
              <ShieldCheck className={cn("size-3.5", device.trusted && "text-chart-1")} aria-hidden="true" />
            </Button>
            <Button size="icon-sm" variant="ghost" onClick={remove} aria-label={`Remove ${displayName}`}>
              <Trash2 className="size-3.5" aria-hidden="true" />
            </Button>
          </div>
        )}
      </div>
    </Card>
  )
}
