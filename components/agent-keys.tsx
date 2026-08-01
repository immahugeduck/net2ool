"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Copy, KeyRound, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { createAgentKey, deleteAgentKey } from "@/app/actions/agent"
import { formatRelativeTime } from "@/lib/format"

export interface AgentKeyRow {
  id: number
  name: string
  keyPrefix: string
  lastUsedAt: Date | null
  revoked: boolean
  createdAt: Date
}

export function AgentKeys({ keys, ingestUrl }: { keys: AgentKeyRow[]; ingestUrl: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [name, setName] = useState("")
  const [freshKey, setFreshKey] = useState<string | null>(null)

  function create(e: React.FormEvent) {
    e.preventDefault()
    startTransition(async () => {
      try {
        const { rawKey } = await createAgentKey(name)
        setFreshKey(rawKey)
        setName("")
        toast.success("Key created — copy it now")
        router.refresh()
      } catch {
        toast.error("Could not create key")
      }
    })
  }

  function remove(id: number) {
    startTransition(async () => {
      await deleteAgentKey(id)
      toast.success("Key deleted")
      router.refresh()
    })
  }

  async function copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text)
      toast.success(`${what} copied`)
    } catch {
      toast.error("Clipboard unavailable — select and copy manually")
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Android agent keys</CardTitle>
        <CardDescription className="text-pretty">
          The agent authenticates with a key. It is shown once at creation and stored only as a hash, so it cannot be
          recovered later.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs text-muted-foreground">Ingest endpoint</Label>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-md border border-border bg-secondary/40 px-2.5 py-2 font-mono text-[11px]">
              {ingestUrl}
            </code>
            <Button size="icon-sm" variant="outline" onClick={() => copy(ingestUrl, "Endpoint")} aria-label="Copy endpoint">
              <Copy className="size-3.5" aria-hidden="true" />
            </Button>
          </div>
        </div>

        {freshKey && (
          <div className="flex flex-col gap-2 rounded-lg border border-chart-2/40 bg-chart-2/10 p-3">
            <p className="text-xs font-medium text-chart-2">Copy this key now — it will not be shown again</p>
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 break-all rounded-md border border-border bg-background px-2.5 py-2 font-mono text-[11px]">
                {freshKey}
              </code>
              <Button size="icon-sm" variant="outline" onClick={() => copy(freshKey, "Key")} aria-label="Copy key">
                <Copy className="size-3.5" aria-hidden="true" />
              </Button>
            </div>
          </div>
        )}

        <form onSubmit={create} className="flex items-end gap-2">
          <div className="flex flex-1 flex-col gap-2">
            <Label htmlFor="key-name">New key name</Label>
            <Input
              id="key-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Pixel 8 agent"
            />
          </div>
          <Button type="submit" disabled={pending}>
            <KeyRound className="size-4" aria-hidden="true" />
            Create
          </Button>
        </form>

        {keys.length > 0 && (
          <div className="flex flex-col divide-y divide-border border-t border-border pt-1">
            {keys.map((key) => (
              <div key={key.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-sm">{key.name}</span>
                    {key.revoked && (
                      <Badge variant="outline" className="text-[10px]">
                        revoked
                      </Badge>
                    )}
                  </span>
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {key.keyPrefix}··· ·{" "}
                    {key.lastUsedAt ? `used ${formatRelativeTime(key.lastUsedAt)}` : "never used"}
                  </span>
                </div>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  onClick={() => remove(key.id)}
                  disabled={pending}
                  aria-label={`Delete ${key.name}`}
                >
                  <Trash2 className="size-3.5" aria-hidden="true" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
