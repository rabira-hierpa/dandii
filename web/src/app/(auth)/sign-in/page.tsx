import { Suspense } from "react";
import { LocaleToggle } from "@/components/foundations/locale-toggle";
import { TransitBackdrop } from "@/components/foundations/transit-backdrop";
import { SignInCard } from "./sign-in-card";

export const metadata = {
  title: "Sign in — Dandii",
};

export default function SignInPage() {
  return (
    <TransitBackdrop>
      <div className="relative z-1 mx-auto flex w-full max-w-110 flex-col justify-center px-6 py-16 max-sm:px-5 max-sm:py-12">
        <div className="mb-6 flex justify-end">
          <LocaleToggle />
        </div>
        <Suspense>
          <SignInCard />
        </Suspense>
      </div>
    </TransitBackdrop>
  );
}
