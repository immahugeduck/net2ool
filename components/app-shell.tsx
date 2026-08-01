"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { Activity, Gauge, HardDrive, History, Router, Settings, ShieldAlert, LogOut } from "lucide-react"
import { cn } from "@/lib/utils"
import { authClient } from "@/lib/auth-client"
import { Button } from "@/components/ui/button"

const NAV = [
  { href: "/", label: "Test", icon: Gauge },
  { href: "/usage", label: "Usage", icon: HardDrive },
  { href: "/devices", label: "Devices", icon: Router },
  { href: "/threats", label: "Threats", icon: ShieldAlert },
  { href: "/history", label: "History", icon: History },
]

export function AppShell({ children, userName }: { children: React.ReactNode; userName?: string }) {
  const pathname = usePathname()
  const router = useRouter()

  async function signOut() {
    await authClient.signOut()
    router.push("/sign-in")
    router.refresh()
  }

  return (
    <div className="flex min-h-svh flex-col">
      <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="flex size-8 items-center justify-center rounded-lg border border-border bg-card">
              <Activity className="size-4 text-primary" aria-hidden="true" />
            </span>
            <span className="font-mono text-sm font-semibold tracking-tight">NetScope</span>
          </Link>

          <nav aria-label="Primary" className="hidden items-center gap-1 md:flex">
            {NAV.map((item) => {
              const active = pathname === item.href
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-sm transition-colors",
                    active ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {item.label}
                </Link>
              )
            })}
          </nav>

          <div className="flex items-center gap-1">
            {userName && <span className="hidden text-xs text-muted-foreground sm:inline">{userName}</span>}
            <Button
              render={<Link href="/settings" />}
              variant="ghost"
              size="icon"
              aria-label="Settings"
            >
              <Settings className="size-4" aria-hidden="true" />
            </Button>
            <Button variant="ghost" size="icon" aria-label="Sign out" onClick={signOut}>
              <LogOut className="size-4" aria-hidden="true" />
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-24 pt-5 md:pb-10">{children}</main>

      <nav
        aria-label="Primary mobile"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 backdrop-blur-md md:hidden"
      >
        <div className="flex items-stretch justify-around">
          {NAV.map((item) => {
            const active = pathname === item.href
            const Icon = item.icon
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] transition-colors",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              >
                <Icon className="size-5" aria-hidden="true" />
                {item.label}
              </Link>
            )
          })}
        </div>
      </nav>
    </div>
  )
}
