"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Save } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { saveSettings } from "@/app/actions/speedtest"

const PRESETS = [10, 20, 45]

export function SettingsForm({
  downloadSeconds: initialDown,
  uploadSeconds: initialUp,
  parallelStreams: initialStreams,
}: {
  downloadSeconds: number
  uploadSeconds: number
  parallelStreams: number
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [downloadSeconds, setDownloadSeconds] = useState(initialDown)
  const [uploadSeconds, setUploadSeconds] = useState(initialUp)
  const [parallelStreams, setParallelStreams] = useState(initialStreams)

  function submit(e: React.FormEvent) {
    e.preventDefault()
    startTransition(async () => {
      try {
        await saveSettings({ downloadSeconds, uploadSeconds, parallelStreams, dataCapGb: null })
        toast.success("Settings saved")
        router.refresh()
      } catch {
        toast.error("Could not save settings")
      }
    })
  }

  const estimate = downloadSeconds + uploadSeconds + 4

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Test parameters</CardTitle>
        <CardDescription className="text-pretty">
          Longer runs average out bursts and give more reliable numbers, but move more data. A 45s download on a
          gigabit line can transfer several GB.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <Label>Download duration</Label>
            <Tabs value={String(downloadSeconds)} onValueChange={(v) => setDownloadSeconds(Number(v))}>
              <TabsList className="w-full">
                {PRESETS.map((p) => (
                  <TabsTrigger key={p} value={String(p)} className="flex-1">
                    {p}s
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>

          <div className="flex flex-col gap-2">
            <Label>Upload duration</Label>
            <Tabs value={String(uploadSeconds)} onValueChange={(v) => setUploadSeconds(Number(v))}>
              <TabsList className="w-full">
                {PRESETS.map((p) => (
                  <TabsTrigger key={p} value={String(p)} className="flex-1">
                    {p}s
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="streams">Parallel streams</Label>
            <Input
              id="streams"
              type="number"
              min={1}
              max={16}
              value={parallelStreams}
              onChange={(e) => setParallelStreams(Number(e.target.value))}
              className="font-mono"
            />
            <p className="text-xs leading-relaxed text-muted-foreground text-pretty">
              A single connection cannot saturate a fast link. 6 is a good default; raise it for gigabit or
              high-latency connections.
            </p>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border bg-secondary/40 px-3 py-2.5 text-sm">
            <span className="text-muted-foreground">Estimated run time</span>
            <span className="font-mono tabular-nums">~{estimate}s</span>
          </div>

          <Button type="submit" disabled={pending} className="w-full">
            <Save className="size-4" aria-hidden="true" />
            {pending ? "Saving…" : "Save settings"}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
