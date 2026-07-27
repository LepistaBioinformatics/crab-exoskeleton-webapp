import type { Locale } from "./config";

// Onboarding was written entirely in hardcoded Portuguese, so an English user
// met a Portuguese wall on their first authenticated screen. Both locales now
// come from here.

const en = {
  // Rendered as "<welcomePrefix> <BrandName />" so a rebranded deployment
  // doesn't greet people with the project's own name.
  welcomePrefix: "Welcome to",
  leadBefore: "Almost there. Click ",
  leadAfter: " and your account is created — then you're in.",
  hintTitle: "A note on what comes next:",
  hint: "your workspaces and agents only appear once an administrator invites you to one. Until then an empty list is expected, not an error.",
  creating: "Creating your account…",
  start: "Let's get started",
  failed: "Something went wrong creating your account. Try again.",
};

export type OnboardingDict = typeof en;

const pt: OnboardingDict = {
  welcomePrefix: "Bem-vindo ao",
  leadBefore: "Estamos quase lá. Ao clicar em ",
  leadAfter: ", a sua conta será criada e você entrará no aplicativo.",
  hintTitle: "Uma dica sobre o que vem a seguir:",
  hint: "os seus workspaces e agentes só aparecem depois que um administrador convidar você para um deles. Até lá, é normal ver a lista vazia — não é um erro.",
  creating: "Criando a sua conta…",
  start: "Vamos começar",
  failed: "Algo deu errado ao criar a sua conta. Tente novamente.",
};

export const onboardingCopy: Record<Locale, OnboardingDict> = { en, pt };
