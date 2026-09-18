"use server";

import { revalidatePath } from "next/cache";
import { assertHasPermission } from "@/modules/identity/repository";
import { getCurrentSession } from "@/modules/identity/session-cookie";
import {
  createRoom,
  removeRoom,
  renameRoom,
  transitionRoomStatus,
} from "@/modules/casting/repository";
import type { RoomStatus } from "@/modules/casting/room-transitions";

async function requireRoomsAccess() {
  const current = await getCurrentSession();
  if (!current) throw new Error("Not signed in");
  await assertHasPermission(current.context, current.context.accountId, "manage_rooms");
  return current;
}

export async function createRoomAction(formData: FormData): Promise<void> {
  const current = await requireRoomsAccess();
  const label = String(formData.get("label") ?? "").trim();
  if (!label) return;
  await createRoom(current.context, label, {
    accountId: current.context.accountId,
    profileId: current.context.profileId,
  });
  revalidatePath("/rooms");
}

export async function renameRoomAction(formData: FormData): Promise<void> {
  const current = await requireRoomsAccess();
  const roomId = String(formData.get("roomId") ?? "");
  const label = String(formData.get("label") ?? "").trim();
  if (!roomId || !label) return;
  await renameRoom(current.context, roomId, label, {
    accountId: current.context.accountId,
    profileId: current.context.profileId,
  });
  revalidatePath("/rooms");
}

export async function transitionRoomAction(formData: FormData): Promise<void> {
  const current = await requireRoomsAccess();
  const roomId = String(formData.get("roomId") ?? "");
  const toStatus = String(formData.get("toStatus") ?? "") as RoomStatus;
  if (!roomId || !toStatus) return;
  await transitionRoomStatus(current.context, roomId, toStatus, {
    accountId: current.context.accountId,
    profileId: current.context.profileId,
  });
  revalidatePath("/rooms");
}

export async function removeRoomAction(formData: FormData): Promise<void> {
  const current = await requireRoomsAccess();
  const roomId = String(formData.get("roomId") ?? "");
  if (!roomId) return;
  await removeRoom(current.context, roomId, {
    accountId: current.context.accountId,
    profileId: current.context.profileId,
  });
  revalidatePath("/rooms");
}
