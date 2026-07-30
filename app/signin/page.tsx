import { Suspense } from "react";
import { startAtSignin } from "@/lib/appConfig";
import SignInForm from "./signin-form";

// The route is a server component for two reasons, both structural:
//
// - START_AT_SIGNIN is server-only and read per request (lib/appConfig.ts), so
//   the flag has to be resolved here and handed down. When it is on, `/`
//   redirects straight to this screen, which makes the landing unreachable
//   (start-at-signin-env R3) -- and the card's "Back to home" link a control
//   that returns the visitor to where they already are. It is not rendered.
// - The Suspense boundary is what the form's `useSearchParams` (the `?step=`
//   state) needs to stay safe if this route is ever prerendered: without one,
//   Next fails the build with a CSR-bailout error rather than at runtime. Same
//   reasoning as app/admin/page.tsx.
export default function SignInPage() {
  return (
    <Suspense>
      <SignInForm showBackLink={!startAtSignin()} />
    </Suspense>
  );
}
