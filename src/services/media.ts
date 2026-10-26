import { db } from "./api";

export async function uploadMedia(file: File, userId: string): Promise<string> {
  const types: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
  };
  const extension = types[file.type];
  if (!extension) throw new Error("Choose a JPG, PNG, or WebP image.");
  if (file.size > 3 * 1024 * 1024)
    throw new Error("Images must be 3 MB or smaller.");
  const path = `${userId}/${crypto.randomUUID()}.${extension}`;
  const { error } = await db()
    .storage.from("qmaster-media")
    .upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw new Error(error.message);
  return path;
}
export async function mediaUrl(path: string) {
  const { data, error } = await db()
    .storage.from("qmaster-media")
    .createSignedUrl(path, 3600);
  if (error) throw new Error(error.message);
  return data.signedUrl;
}
