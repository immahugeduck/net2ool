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
import { addManualUsage } from "@/app/actions/usage"

export function ManualUsageForm() {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [rxMb, setRxMb] = useState("")
  const [txMb, setTxMb] = useState("")
  const [connectionType, setConnectionType] = useState("wifi")

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const rx = Number(rxMb)
    const tx = Number(txMb)

    if (!Number.isFinite(rx) || !Number.isFinite(tx) || (rx <= 0 && tx <= 0)) {
      toast.error("Enter at least one positive value in MB")
      return
    }

    startTransition(async () => {
      try {
        await addManualUsage({ rxMb: rx || 0, txMb: tx || 0, connectionType })
        setRxMb("")
        setTxMb("")
        toast.success("Usage entry added")
        router.refresh()
      } catch {
        toast.error("Could not save that entry")
      }
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Add usage manually</CardTitle>
        <CardDescription className="text-pretty">
          Read totals off your carrier app or router page. Browsers cannot access OS-level byte counters, so this is the
          accurate route until the Android agent is installed.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="rx-mb">Downloaded (MB)</Label>
              <Input
                id="rx-mb"
                inputMode="decimal"
                value={rxMb}
                onChange={(e) => setRxMb(e.target.value)}
                placeholder="1250"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="tx-mb">Uploaded (MB)</Label>
              <Input
                id="tx-mb"
                inputMode="decimal"
                value={txMb}
                onChange={(e) => setTxMb(e.target.value)}
                placeholder="310"
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="usage-conn">Connection</Label>
            <Select value={connectionType} onValueChange={setConnectionType}>
              <SelectTrigger id="usage-conn">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="wifi">Wi-Fi</SelectItem>
                <SelectItem value="cellular">Cellular</SelectItem>
                <SelectItem value="ethernet">Ethernet</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button type="submit" disabled={pending} className="w-full">
            <Plus className="size-4" aria-hidden="true" />
            {pending ? "Saving…" : "Add entry"}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
