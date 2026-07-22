import type { ReactNode } from "react";
import styles from "./landing.module.css";

// The landing's dark "bioluminescent mycelium" field, reusable as a backdrop
// for other pre-auth pages (e.g. sign-in) so they read as one product.
export default function MyceliumBg({ children }: { children: ReactNode }) {
  return (
    <div className={styles.backdrop}>
      <div className={styles.field} aria-hidden />
      <div className={styles.backdropInner}>{children}</div>
    </div>
  );
}
