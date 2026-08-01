export const dynamic = "force-static"

/** PWA manifest so NetScope can be installed to an Android home screen. */
export function GET() {
  return Response.json(
    {
      name: "NetScope — Network Diagnostics",
      short_name: "NetScope",
      description:
        "Speed testing, data usage tracking, device inventory, and threat detection for your network.",
      start_url: "/",
      display: "standalone",
      orientation: "portrait",
      background_color: "#12181f",
      theme_color: "#12181f",
      icons: [
        { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
        { src: "/apple-icon.png", sizes: "180x180", type: "image/png" },
      ],
    },
    { headers: { "Content-Type": "application/manifest+json" } },
  )
}
