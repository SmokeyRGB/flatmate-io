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
import { de } from "@/ui/strings";

async function requireRoomsAccess() {
  const current = await getCurrentSession();
  if (!current) throw new Error("Not signed in");
  await assertHasPermission(current.context, current.context.accountId, "manage_rooms");
  return current;
}

export interface CreateRoomFormState {
  error: string | null;
}

// Returns a state for new-room-dialog.tsx's useActionState: an empty label used to return
// silently, which read as a dead button. The input is `required` too, but "   " passes that.
export async function createRoomAction(
  _prevState: CreateRoomFormState,
  formData: FormData,
): Promise<CreateRoomFormState> {
  const current = await requireRoomsAccess();
  const label = String(formData.get("label") ?? "").trim();
  if (!label) return { error: de.rooms.create.labelRequired };
  try {
    await createRoom(current.context, label, {
      accountId: current.context.accountId,
      profileId: current.context.profileId,
    });
  } catch (err) {
    // A throw here would swap the page for Next's error screen and lose the dialog. The class
    // name only: a driver error can echo the inserted row, and the label is free text (G-D7).
    console.error("createRoomAction failed:", err instanceof Error ? err.name : typeof err);
    return { error: de.rooms.create.genericFailure };
  }
  revalidatePath("/rooms");
  return { error: null };
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
