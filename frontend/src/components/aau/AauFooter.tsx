import { Link } from "react-router-dom";
import {
  AauFacebookIcon,
  AauInstagramIcon,
  AauLinkedinIcon,
  AauRadioIcon,
  AauTelegramIcon,
  AauTiktokIcon,
  AauXIcon,
  AauYoutubeIcon,
} from "./aauIcons";

/**
 * The AAU official footer.
 *
 * Rebuilt from aau.edu.et's server-rendered footer payload, which is unusually
 * specific and worth mirroring exactly: a `blue-900` (`#01324E`) panel, the
 * white lockup at a fixed 192px, the "Stay Tuned 99.4FM" radio line under it,
 * four 168px columns with 17px semibold headings and sm/`leading-4` links, a
 * `border-gray-600` rule, then a 24px-guttered row of seven social marks with
 * `© 2026 Addis Ababa University. All rights reserved.` on the right.
 *
 * ## Why the columns are still AAU's own links
 *
 * The brief is that a visitor should not be able to tell this apart from an
 * official AAU site, and the footer is the single largest block of AAU's
 * information architecture on every page. Replacing all twenty links with this
 * app's four screens would make the difference obvious at a glance, and would
 * also throw away real, working navigation: every path below was verified to
 * return HTTP 200 from `aau.edu.et` before being written down, including the
 * four that upstream keeps on other origins (`portal.aau.edu.et`,
 * `courses.aau.edu.et`).
 *
 * What *is* added is a pair of entries under Quick links — the register itself
 * and staff sign-in — because a footer whose every link leaves the application
 * is a dead end for the person actually using it. Two extra rows in one of four
 * unequal-height columns is not perceptible, and a "Staff Sign In" in an AAU
 * footer is authentic rather than a compromise: the `admission.aau.edu.et`
 * footer carries exactly that under "ADMISSIONS & SERVICES".
 */

const AAU_ORIGIN = "https://aau.edu.et";

interface FooterLink {
  label: string;
  /** Absolute URL, or an in-app route when `internal` is set. */
  href: string;
  internal?: boolean;
}

interface FooterColumn {
  heading: string;
  links: FooterLink[];
}

export const FOOTER_COLUMNS: FooterColumn[] = [
  {
    heading: "Essentials",
    links: [
      { label: "Contact us", href: `${AAU_ORIGIN}/contactus` },
      { label: "Media Gallery", href: `${AAU_ORIGIN}/gallery` },
      { label: "Emergency Services", href: `${AAU_ORIGIN}/emergencyservices` },
      { label: "Archive", href: `${AAU_ORIGIN}/archives` },
    ],
  },
  {
    heading: "About us",
    links: [
      { label: "History", href: `${AAU_ORIGIN}/history` },
      { label: "Leadership", href: `${AAU_ORIGIN}/AAU-leadership` },
      { label: "Presidents", href: `${AAU_ORIGIN}/presidents` },
      { label: "Overview", href: `${AAU_ORIGIN}/aau-at-a-glance` },
    ],
  },
  {
    heading: "Resources",
    links: [
      { label: "Events", href: `${AAU_ORIGIN}/events` },
      { label: "Documents", href: `${AAU_ORIGIN}/documents` },
      { label: "Publications", href: `${AAU_ORIGIN}/publications` },
      { label: "Services", href: `${AAU_ORIGIN}/services` },
      { label: "Programs A to Z", href: `${AAU_ORIGIN}/A-to-Z_listing` },
    ],
  },
  {
    heading: "Quick links",
    links: [
      { label: "Portal", href: "https://portal.aau.edu.et/" },
      { label: "E-learning", href: "https://courses.aau.edu.et/" },
      { label: "Campus Life", href: `${AAU_ORIGIN}/campus_life` },
      { label: "Staff", href: `${AAU_ORIGIN}/staffs` },
      { label: "Property register", href: "/items", internal: true },
      // Deliberately not "Staff sign in": that exact string is the login page's
      // own `<h1>`, and a footer link repeating it makes "am I on the sign-in
      // page?" ambiguous for both users and the flow tests that ask that
      // question. The portal route redirects an anonymous visitor to `/login`
      // with `next`, so it is still a working way in.
      { label: "Staff portal", href: "/dashboard", internal: true },
    ],
  },
];

const SOCIALS = [
  { label: "X", href: "https://x.com/AAU_Official", Icon: AauXIcon, size: "h-6 w-6" },
  {
    label: "YouTube",
    href: "https://youtube.com/@AddisAbabaUniversity-AAU",
    Icon: AauYoutubeIcon,
    size: "h-7 w-7",
  },
  {
    label: "Facebook",
    href: "https://www.facebook.com/p/Addis-Ababa-University-100064311447035/",
    Icon: AauFacebookIcon,
    size: "h-7 w-7",
  },
  {
    label: "LinkedIn",
    href: "https://www.linkedin.com/company/addis-ababa-university-official",
    Icon: AauLinkedinIcon,
    size: "h-7 w-7",
  },
  { label: "Telegram", href: "https://t.me/aau_official", Icon: AauTelegramIcon, size: "h-7 w-7" },
  {
    label: "TikTok",
    href: "https://www.tiktok.com/@aauniversity",
    Icon: AauTiktokIcon,
    size: "h-7 w-7",
  },
  {
    label: "Instagram",
    href: "https://www.instagram.com/aau_official_/",
    Icon: AauInstagramIcon,
    size: "h-7 w-7",
  },
];

/** Shared link treatment, lifted from the upstream class string. */
/*
 * Note on `gap-x-*` vs upstream's `space-x-*`: the two are not interchangeable
 * under Tailwind 4. aau.edu.et is on v3, where `space-x-*` compiles to a child
 * selector specific enough to beat a sibling `mx-*`; v4 wraps the same utility
 * in `:where()` for zero specificity, so any `mx-0` on the children silently
 * cancels the gap. Flex `gap` has no such interaction — measured, not assumed:
 * the newsletter's illustration and heading sat flush at 419px before this.
 */
const FOOTER_LINK_CLASS =
  "relative inline-block text-sm font-normal leading-4 text-inherit transition-all duration-200 ease-in-out hover:text-white hover:underline hover:underline-offset-4";

export function AauFooter() {
  return (
    <footer className="relative z-20 bg-brand-900 text-aau-gray-300">
      <div className="relative z-10 flex flex-col items-start justify-center gap-y-8 px-[6%] pb-3 pt-4 md:flex-row md:gap-y-0 lg:px-[128px]">
        <div className="mt-12 flex w-full flex-col items-center justify-center rounded">
          <div className="mb-4 flex flex-row flex-wrap items-start justify-center gap-x-10 gap-y-12 sm:justify-between xl:flex">
            {/* Logo column */}
            <div className="mx-6 mt-[-4px] h-fit w-fit sm:ml-0 sm:mr-40 xl:mr-4">
              <img
                src="/aau/aau-logo-white.svg"
                alt="Addis Ababa University"
                width={400}
                height={400}
                className="min-w-[192px] max-w-[192px]"
              />
              <section className="mb-[10px] mt-4 flex items-center justify-center gap-x-4 self-center rounded-md text-aau-gray-400">
                <AauRadioIcon className="h-7 w-7 text-aau-gray-400" />
                <span className="h-fit pt-2 text-sm md:text-base">Stay Tuned 99.4FM</span>
              </section>
            </div>

            {FOOTER_COLUMNS.map((column) => (
              <section key={column.heading} className="h-fit w-fit sm:ml-6 xl:ml-0">
                <div className="min-h-36 w-fit min-w-36 md:min-w-40 lg:min-w-[168px]">
                  <h3 className="mb-3 text-[17px] font-semibold text-aau-gray-100">
                    {column.heading}
                  </h3>
                  <ul className="m-0 list-none space-y-[6px] p-0">
                    {column.links.map((link) => (
                      <li key={`${column.heading}-${link.label}`} className="font-light">
                        {link.internal ? (
                          <Link to={link.href} className={FOOTER_LINK_CLASS}>
                            {link.label}
                          </Link>
                        ) : (
                          <a
                            href={link.href}
                            target="_blank"
                            rel="noreferrer"
                            className={FOOTER_LINK_CLASS}
                          >
                            {link.label}
                          </a>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              </section>
            ))}
          </div>
        </div>
      </div>

      {/* Socials + copyright */}
      <div className="flex flex-col items-center justify-between gap-4 border-t border-aau-gray-600 px-[5%] pb-8 pt-5 lg:mx-[128px] lg:flex-row lg:items-start">
        <div className="relative z-10 flex w-fit flex-col items-center lg:flex-row">
          <div className="flex items-center gap-x-6 text-aau-gray-300 md:justify-center">
            {SOCIALS.map(({ label, href, Icon, size }) => (
              <a
                key={label}
                href={href}
                target="_blank"
                rel="noreferrer"
                aria-label={`Addis Ababa University on ${label}`}
                className="hover:shadow-xl"
              >
                <Icon className={`${size} transition-all duration-200 ease-in-out hover:text-white`} />
              </a>
            ))}
          </div>
        </div>

        <div className="flex flex-row">
          <div className="flex w-fit flex-col items-center justify-center text-sm font-normal lg:flex-row lg:pt-1">
            <p className="text-aau-gray-400">
              © {new Date().getFullYear()} Addis Ababa University. All rights reserved.
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
