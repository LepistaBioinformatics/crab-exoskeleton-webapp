import type { DetailedHTMLProps, HTMLAttributes } from "react";

// The Lepista Brand Bar is a Shadow-DOM web component loaded from
// lepista.com.br (<lbl-brand-bar>). Declare it so it typechecks as an
// intrinsic JSX element with its documented attributes.
declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "lbl-brand-bar": DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & {
        locale?: string;
        "current-site"?: string;
      };
    }
  }
}
