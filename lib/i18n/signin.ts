import type { Locale } from "./config";

// Sign-in copy. The brand name is rendered by <BrandName /> and never
// translated; only the prose around it lives here.

const en = {
  back: "Back to home",
  titleSuffix: "chat",
  subtitle: "Sign in with your email — no password needed.",
  emailLabel: "Email",
  emailPlaceholder: "you@company.com",
  sending: "Sending…",
  sendLink: "Send magic link",
  codeLabel: "Code",
  codeAria: "Verification code",
  verifying: "Verifying…",
  verify: "Verify",
  backToEmail: "← Back",
  gatewayDown: "Could not reach the gateway. Is the stack running?",
  invalidCode: "Invalid code. Try again.",
  // Split around the email address, which is rendered in <strong>.
  checkMailBefore: "Check ",
  checkMailAfter: " for a link, open it, and enter the 6-digit code it shows.",
};

export type SignInDict = typeof en;

const pt: SignInDict = {
  back: "Voltar ao início",
  titleSuffix: "chat",
  subtitle: "Entre com seu e-mail — sem senha.",
  emailLabel: "E-mail",
  emailPlaceholder: "voce@empresa.com",
  sending: "Enviando…",
  sendLink: "Enviar link mágico",
  codeLabel: "Código",
  codeAria: "Código de verificação",
  verifying: "Verificando…",
  verify: "Verificar",
  backToEmail: "← Voltar",
  gatewayDown: "Não foi possível falar com o gateway. A stack está no ar?",
  invalidCode: "Código inválido. Tente de novo.",
  checkMailBefore: "Confira ",
  checkMailAfter: " para receber um link, abra-o e digite o código de 6 dígitos que aparecer.",
};

export const signInCopy: Record<Locale, SignInDict> = { en, pt };
