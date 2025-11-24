// globalAvatar.ts
import { AvaturnHead } from "@avaturn-live/web-sdk";

let globalAvatar: AvaturnHead | null = null;

export const getGlobalAvatar = () => globalAvatar;
export const setGlobalAvatar = (instance: AvaturnHead) => {
  globalAvatar = instance;
};
