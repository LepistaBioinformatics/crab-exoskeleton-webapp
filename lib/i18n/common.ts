import type { Locale } from "./config";

// Strings shared by more than one screen: the UI primitives in components/ui
// and the generic verbs that would otherwise be retyped in every panel. Copy
// that belongs to exactly one screen lives in that screen's namespace instead.

const en = {
  actions: {
    save: "Save",
    cancel: "Cancel",
    confirm: "Confirm",
    delete: "Delete",
    close: "Close",
    reset: "Reset",
    add: "Add",
    edit: "Edit",
    remove: "Remove",
    retry: "Try again",
    back: "Back",
  },
  state: {
    loading: "Loading",
    saving: "Saving…",
    deleting: "Deleting…",
  },
  copy: {
    asMarkdown: "Copy as markdown",
    copied: "Copied",
  },
  language: {
    label: "Language",
  },
  // Suffixes, not whole strings: the app name is branding and comes from the
  // database, so only the trailing prose is translated.
  metadata: {
    titleSuffix: "chat",
    description: "your own private AI agent",
  },
};

export type CommonDict = typeof en;

const pt: CommonDict = {
  actions: {
    save: "Salvar",
    cancel: "Cancelar",
    confirm: "Confirmar",
    delete: "Excluir",
    close: "Fechar",
    reset: "Redefinir",
    add: "Adicionar",
    edit: "Editar",
    remove: "Remover",
    retry: "Tentar de novo",
    back: "Voltar",
  },
  state: {
    loading: "Carregando",
    saving: "Salvando…",
    deleting: "Excluindo…",
  },
  copy: {
    asMarkdown: "Copiar como markdown",
    copied: "Copiado",
  },
  language: {
    label: "Idioma",
  },
  metadata: {
    titleSuffix: "chat",
    description: "seu agente de IA privado",
  },
};

export const commonCopy: Record<Locale, CommonDict> = { en, pt };
