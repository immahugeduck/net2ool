"use server"

import { and, desc, eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { networkDevice } from "@/lib/db/schema"
import { getUserId } from "@/lib/session"
import { normalizeMac, vendorFromMac } from "@/lib/oui"

export async function getDevices() {
  const userId = await getUserId()
  return db
    .select()
    .from(networkDevice)
    .where(eq(networkDevice.userId, userId))
    .orderBy(desc(networkDevice.isOnline), desc(networkDevice.lastSeen))
}

export async function addDevice(input: {
  macAddress: string
  ipAddress?: string
  customName?: string
  deviceType?: string
  notes?: string
}) {
  const userId = await getUserId()

  const mac = normalizeMac(input.macAddress)
  if (!mac) throw new Error("Enter a valid MAC address, e.g. A4:B1:C2:D3:E4:F5")

  await db
    .insert(networkDevice)
    .values({
      userId,
      macAddress: mac,
      ipAddress: input.ipAddress?.trim() || null,
      customName: input.customName?.trim() || null,
      deviceType: input.deviceType || "unknown",
      vendor: vendorFromMac(mac),
      notes: input.notes?.trim() || null,
      source: "manual",
      isOnline: true,
    })
    .onConflictDoUpdate({
      target: [networkDevice.userId, networkDevice.macAddress],
      set: {
        ipAddress: input.ipAddress?.trim() || null,
        customName: input.customName?.trim() || null,
        deviceType: input.deviceType || "unknown",
        notes: input.notes?.trim() || null,
        lastSeen: new Date(),
      },
    })

  revalidatePath("/devices")
}

/** The rename feature: assigns a friendly name to a discovered device. */
export async function renameDevice(id: number, customName: string) {
  const userId = await getUserId()
  const trimmed = customName.trim().slice(0, 80)

  await db
    .update(networkDevice)
    .set({ customName: trimmed || null })
    .where(and(eq(networkDevice.id, id), eq(networkDevice.userId, userId)))

  revalidatePath("/devices")
}

export async function setDeviceTrusted(id: number, trusted: boolean) {
  const userId = await getUserId()
  await db
    .update(networkDevice)
    .set({ trusted })
    .where(and(eq(networkDevice.id, id), eq(networkDevice.userId, userId)))
  revalidatePath("/devices")
  revalidatePath("/threats")
}

export async function updateDeviceType(id: number, deviceType: string) {
  const userId = await getUserId()
  await db
    .update(networkDevice)
    .set({ deviceType })
    .where(and(eq(networkDevice.id, id), eq(networkDevice.userId, userId)))
  revalidatePath("/devices")
}

export async function deleteDevice(id: number) {
  const userId = await getUserId()
  await db.delete(networkDevice).where(and(eq(networkDevice.id, id), eq(networkDevice.userId, userId)))
  revalidatePath("/devices")
}
