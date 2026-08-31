import type { ProviderStreams } from "../types.ts";
import { lazyApi } from "./lazy.ts";

export const appMessagesApi = (): ProviderStreams => lazyApi(() => import("./pi-messages.ts"));
