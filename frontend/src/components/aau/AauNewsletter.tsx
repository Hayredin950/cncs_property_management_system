import { useState } from "react";
import { z } from "zod";
import { toast } from "../../lib/toast";

/**
 * The "Subscribe to our Newsletter." band that sits directly above the footer on
 * aau.edu.et.
 *
 * Layout, copy and the gate-lions illustration are upstream's: a `gray-100` strip
 * at `lg:h-[180px]`, the `gateLions.svg` art at 150×113 inside a container that
 * carries a blue underline on mobile and drops it at `lg`, the uppercase heading
 * in Geist semibold, a 220px email field and a filled blue Subscribe button.
 *
 * ## Why this one is client-side
 *
 * Every other part of this shell proxies a real thing the app already has — the
 * header navigates real routes, the footer links real pages. The newsletter has
 * no backend: there is no `/newsletter` endpoint in `backend/src/routes`, and
 * inventing one would mean a Prisma migration, an admin screen to read the list,
 * and an unsubscribe story, none of which are in scope for a UI-parity change.
 *
 * So the honest version is kept: the form validates, persists the address to
 * `localStorage` under a namespaced key, and confirms to the user — the same
 * subscribe → success cycle the real site runs, without pretending to have told
 * anyone. `localStorage` is also the natural drop-in point for a real call:
 * swapping `saveNewsletterSubscriber` for a POST leaves the component untouched.
 * Flagged in the handoff notes as the one mocked surface.
 */
const NEWSLETTER_KEY = "cncs.newsletter.subscribers";

export const subscribeSchema = z.object({
  email: z.email("Please enter a valid email address"),
});

export function saveNewsletterSubscriber(email: string): void {
  try {
    const raw = localStorage.getItem(NEWSLETTER_KEY);
    const existing: unknown = raw ? JSON.parse(raw) : [];
    const list = Array.isArray(existing) ? (existing as unknown[]) : [];
    if (list.includes(email)) return;
    localStorage.setItem(NEWSLETTER_KEY, JSON.stringify([...list, email]));
  } catch {
    // Storage disabled or full (private browsing): the confirmation is still the
    // right thing to show — the alternative is failing a newsletter signup.
  }
}

export function AauNewsletter() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = subscribeSchema.safeParse({ email: email.trim() });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Please enter a valid email address");
      return;
    }
    setError(null);
    saveNewsletterSubscriber(parsed.data.email);
    setEmail("");
    toast.success("You have successfully subscribed to our newsletter.");
  }

  return (
    <div className="relative box-border flex h-fit w-full items-center justify-center overflow-hidden bg-aau-gray-100 lg:h-[180px]">
      <section className="flex w-full flex-col flex-wrap items-center justify-center px-[6%] pb-14 pt-12 lg:flex-row lg:px-32 lg:py-0">
        <div className="flex w-full max-w-[340px] flex-col items-center justify-between gap-y-4 px-2 lg:w-fit lg:max-w-full lg:flex-row lg:items-center lg:gap-x-12 lg:gap-y-0 lg:px-0 xl:px-12">
          {/* `gap-x-10`, not upstream's `space-x-10`: see the note in AauFooter.tsx —
              under Tailwind 4 the v3 spacing helper loses to the children's `mx-*`. */}
          <div className="flex flex-col items-center lg:flex-row lg:gap-x-10">
            <div className="mx-auto mb-4 flex w-full items-center justify-center border-b-2 border-brand-600 lg:mx-0 lg:w-fit lg:border-none">
              <img
                src="/aau/gate-lions.svg"
                alt=""
                width={600}
                height={300}
                className="mb-[-16px] h-[113px] w-[150px] object-contain"
              />
            </div>
            <div className="flex w-full flex-col items-center justify-center text-center lg:w-fit lg:items-start lg:text-left">
              <h2 className="mb-1 w-fit text-base font-semibold uppercase text-aau-gray-800 lg:text-xl">
                Subscribe to our Newsletter.
              </h2>
            </div>
          </div>

          <form onSubmit={handleSubmit} noValidate className="w-full pt-2 lg:w-fit lg:pt-0">
            <div className="flex flex-col items-center gap-y-2 lg:flex-row lg:items-start lg:gap-x-1 lg:gap-y-0">
              <div>
                <input
                  id="newsletter-email"
                  type="email"
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value);
                    if (error) setError(null);
                  }}
                  aria-label="Email address"
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? "newsletter-email-error" : undefined}
                  className="h-12 w-full rounded-sm border border-aau-gray-300 px-3 py-2 focus:border-brand-600 focus:outline-none focus:ring-brand-500 lg:w-[220px]"
                  placeholder="Enter your email"
                  required
                />
                {error && (
                  <p id="newsletter-email-error" role="alert" className="mt-1 text-xs text-danger-700">
                    {error}
                  </p>
                )}
              </div>
              <button
                type="submit"
                className="h-12 w-full rounded-sm border-[3px] border-transparent bg-brand-600 px-6 text-base font-medium text-white shadow-md transition-all duration-200 hover:bg-brand-700 lg:w-fit"
              >
                Subscribe
              </button>
            </div>
          </form>
        </div>
      </section>
    </div>
  );
}
