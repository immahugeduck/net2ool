"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { addDevice } from "@/app/actions/devices"

const TYPES = ["unknown", "phone", "laptop", "tv", "camera", "speaker", "console", "iot", "router", "printer"]

export function AddDeviceForm() {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [macAddress, setMacAddress] = useState("")
  const [ipAddress, setIpAddress] = useState("")
  const [customName, setCustomName] = useState("")
  const [deviceType, setDeviceType] = useState("unknown")

  function submit(e: React.FormEvent) {
    e.preventDefault()
    startTransition(async () => {
      try {
        await addDevice({ macAddress, ipAddress, customName, deviceType })
        setMacAddress("")
        setIpAddress("")
        setCustomName("")
        setDeviceType("unknown")
        toast.success("Device saved")
        router.refresh()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not save device")
      }
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Add a device</CardTitle>
        <CardDescription className="text-pretty">
          Find MAC addresses on your router&apos;s client list. The vendor is identified automatically from the MAC
          prefix.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="mac">MAC address</Label>
            <Input
              id="mac"
              required
              value={macAddress}
              onChange={(e) => setMacAddress(e.target.value)}
              placeholder="A4:B1:C2:D3:E4:F5"
              className="font-mono"
              autoComplete="off"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="ip">IP address</Label>
              <Input
                id="ip"
                value={ipAddress}
                onChange={(e) => setIpAddress(e.target.value)}
                placeholder="192.168.1.42"
                className="font-mono"
                autoComplete="off"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="dev-type">Type</Label>
              <Select value={deviceType} onValueChange={setDeviceType}>
                <SelectTrigger id="dev-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TYPES.map((t) => (
                    <SelectItem key={t} value={t} className="capitalize">
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="dev-name">Name</Label>
            <Input
              id="dev-name"
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              placeholder="Living room TV"
            />
          </div>

          <Button type="submit" disabled={pending} className="w-full">
            <Plus className="size-4" aria-hidden="true" />
            {pending ? "Saving…" : "Add device"}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
