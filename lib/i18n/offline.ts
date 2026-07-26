import type { Locale } from "./config";

const en = {
  metaTitle: "Offline",
  title: "You're offline",
  body: "The app can't reach the network right now. Check your connection and try again — your chats are waiting once you're back online.",
};

export type OfflineDict = typeof en;

const pt: OfflineDict = {
  metaTitle: "Offline",
  title: "Você está offline",
  body: "O aplicativo não consegue acessar a rede agora. Verifique sua conexão e tente de novo — suas conversas continuam aqui quando você voltar.",
};

export const offlineCopy: Record<Locale, OfflineDict> = { en, pt };
