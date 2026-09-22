import type { SVGProps } from "react";

/**
 * The icon set the official AAU chrome uses.
 *
 * These are **verbatim** copies of the SVGs aau.edu.et serves, not lookalikes:
 * the header's home and Search marks come from `aau.edu.et/images/{home,carbon-search}.svg`,
 * and the footer's radio + social marks are the same Iconify glyphs their footer
 * renders (`carbon:radio`, `prime:twitter`, `mingcute:youtube-fill`,
 * `bi:facebook`, `mingcute:linkedin-fill`, `mingcute:telegram-fill`,
 * `ic:baseline-tiktok`, `ri:instagram-fill`).
 *
 * One deliberate change from upstream: their `home.svg` and `carbon-search.svg`
 * hardcode `fill="#667085"` / `fill="#475467"`, so they cannot inherit a hover
 * colour. These are `currentColor`, which is what makes the AAU header's own
 * `hover:bg-gray-100` and the footer's `hover:text-white` work without an extra
 * asset each. Path data is untouched.
 *
 * `lucide-react` covers most of this app, but its brand marks are deprecated
 * upstream — relying on them for the footer's seven social links would make an
 * "indistinguishable from the official site" requirement depend on a deprecated
 * icon set. Hence the explicit copies.
 */

function AauSvg({ children, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false" {...props}>
      {children}
    </svg>
  );
}

/** aau.edu.et header home button. */
export function AauHomeIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <AauSvg viewBox="0 0 512 512" {...props}>
      <path
        fill="currentColor"
        d="M261.56 101.28a8 8 0 0 0-11.06 0L66.4 277.15a8 8 0 0 0-2.47 5.79L63.9 448a32 32 0 0 0 32 32H192a16 16 0 0 0 16-16V328a8 8 0 0 1 8-8h80a8 8 0 0 1 8 8v136a16 16 0 0 0 16 16h96.06a32 32 0 0 0 32-32V282.94a8 8 0 0 0-2.47-5.79Z"
      />
      <path
        fill="currentColor"
        d="m490.91 244.15l-74.8-71.56V64a16 16 0 0 0-16-16h-48a16 16 0 0 0-16 16v32l-57.92-55.38C272.77 35.14 264.71 32 256 32c-8.68 0-16.72 3.14-22.14 8.63l-212.7 203.5c-6.22 6-7 15.87-1.34 22.37A16 16 0 0 0 43 267.56L250.5 69.28a8 8 0 0 1 11.06 0l207.52 198.28a16 16 0 0 0 22.59-.44c6.14-6.36 5.63-16.86-.76-22.97"
      />
    </AauSvg>
  );
}

/** aau.edu.et header search button. */
export function AauSearchIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <AauSvg viewBox="0 0 32 32" {...props}>
      <path
        fill="currentColor"
        d="m29 27.586l-7.552-7.552a11.018 11.018 0 1 0-1.414 1.414L27.586 29ZM4 13a9 9 0 1 1 9 9a9.01 9.01 0 0 1-9-9"
      />
    </AauSvg>
  );
}

/** The "Stay Tuned 99.4FM" radio mark in the official footer. */
export function AauRadioIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <AauSvg viewBox="0 0 32 32" {...props}>
      <path
        fill="currentColor"
        d="M28 10h-4V2h-2v8h-9V8h-2v2H8V8H6v2H4a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h24a2 2 0 0 0 2-2V12a2 2 0 0 0-2-2M4 28V12h24v16Z"
      />
      <path
        fill="currentColor"
        d="M10 26a4 4 0 1 1 4-4a4 4 0 0 1-4 4m0-6a2 2 0 1 0 2 2a2 2 0 0 0-2-2m-3-6h6v2H7zm10 2h9v2h-9zm0 4h9v2h-9zm0 4h9v2h-9z"
      />
    </AauSvg>
  );
}

export function AauXIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <AauSvg viewBox="0 0 14 14" {...props}>
      <path
        fill="currentColor"
        d="M11.025.656h2.147L8.482 6.03L14 13.344H9.68L6.294 8.909l-3.87 4.435H.275l5.016-5.75L0 .657h4.43L7.486 4.71zm-.755 11.4h1.19L3.78 1.877H2.504z"
      />
    </AauSvg>
  );
}

export function AauYoutubeIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <AauSvg {...props}>
      <path
        fill="currentColor"
        d="M12 4.25c2.214 0 4.571.151 6.248.287a3.55 3.55 0 0 1 3.267 3.198c.12 1.234.235 2.803.235 4.265s-.116 3.03-.235 4.265a3.55 3.55 0 0 1-3.267 3.198c-1.677.136-4.034.287-6.248.287s-4.571-.151-6.248-.287a3.55 3.55 0 0 1-3.267-3.198C2.365 15.03 2.25 13.462 2.25 12s.116-3.03.235-4.265a3.55 3.55 0 0 1 3.267-3.198C7.429 4.401 9.786 4.25 12 4.25m-1.1 4.806a.6.6 0 0 0-.9.52v4.849c0 .462.5.75.9.52l4.2-2.425a.6.6 0 0 0 0-1.04z"
      />
    </AauSvg>
  );
}

export function AauFacebookIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <AauSvg viewBox="0 0 16 16" {...props}>
      <path
        fill="currentColor"
        d="M16 8.049c0-4.446-3.582-8.05-8-8.05C3.58 0-.002 3.603-.002 8.05c0 4.017 2.926 7.347 6.75 7.951v-5.625h-2.03V8.05H6.75V6.275c0-2.017 1.195-3.131 3.022-3.131c.876 0 1.791.157 1.791.157v1.98h-1.009c-.993 0-1.303.621-1.303 1.258v1.51h2.218l-.354 2.326H9.25V16c3.824-.604 6.75-3.934 6.75-7.951"
      />
    </AauSvg>
  );
}

export function AauLinkedinIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <AauSvg {...props}>
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M3 6a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3zm4 2a1 1 0 0 1 1-1h.002a1 1 0 1 1 0 2H8a1 1 0 0 1-1-1m7.503 3.191a1.9 1.9 0 0 0-1.307-.21c-.246.05-.566.253-.855.577a2.2 2.2 0 0 0-.297.418a1 1 0 0 0-.044.092V16a1 1 0 1 1-2 0v-6a1 1 0 0 1 1.812-.584c.296-.18.63-.324.992-.396a3.9 3.9 0 0 1 2.729.457C16.356 9.972 17 10.84 17 12v4a1 1 0 1 1-2 0v-4q0-.51-.497-.809M8 10a1 1 0 0 1 1 1v5a1 1 0 1 1-2 0v-5a1 1 0 0 1 1-1"
        clipRule="evenodd"
      />
    </AauSvg>
  );
}

export function AauTelegramIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <AauSvg {...props}>
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M19.777 4.93a1.5 1.5 0 0 1 2.062 1.626l-2.268 13.757c-.22 1.327-1.676 2.088-2.893 1.427c-1.018-.553-2.53-1.405-3.89-2.294c-.68-.445-2.763-1.87-2.507-2.884c.22-.867 3.72-4.125 5.72-6.062c.785-.761.427-1.2-.5-.5c-2.302 1.738-5.998 4.381-7.22 5.125c-1.078.656-1.64.768-2.312.656c-1.226-.204-2.363-.52-3.291-.905c-1.254-.52-1.193-2.244-.001-2.746z"
        clipRule="evenodd"
      />
    </AauSvg>
  );
}

export function AauTiktokIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <AauSvg {...props}>
      <path
        fill="currentColor"
        d="M16.6 5.82s.51.5 0 0A4.28 4.28 0 0 1 15.54 3h-3.09v12.4a2.59 2.59 0 0 1-2.59 2.5c-1.42 0-2.6-1.16-2.6-2.6c0-1.72 1.66-3.01 3.37-2.48V9.66c-3.45-.46-6.47 2.22-6.47 5.64c0 3.33 2.76 5.7 5.69 5.7c3.14 0 5.69-2.55 5.69-5.7V9.01a7.35 7.35 0 0 0 4.3 1.38V7.3s-1.88.09-3.24-1.48"
      />
    </AauSvg>
  );
}

export function AauInstagramIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <AauSvg {...props}>
      <path
        fill="currentColor"
        d="M13.028 2c1.125.003 1.696.009 2.189.023l.194.007c.224.008.445.018.712.03c1.064.05 1.79.218 2.427.465c.66.254 1.216.598 1.772 1.153a4.9 4.9 0 0 1 1.153 1.772c.247.637.415 1.363.465 2.428c.012.266.022.487.03.712l.006.194c.015.492.021 1.063.023 2.188l.001.746v1.31a79 79 0 0 1-.023 2.188l-.006.194c-.008.225-.018.446-.03.712c-.05 1.065-.22 1.79-.466 2.428a4.9 4.9 0 0 1-1.153 1.772a4.9 4.9 0 0 1-1.772 1.153c-.637.247-1.363.415-2.427.465l-.712.03l-.194.006c-.493.014-1.064.021-2.189.023l-.746.001h-1.309a78 78 0 0 1-2.189-.023l-.194-.006a63 63 0 0 1-.712-.031c-1.064-.05-1.79-.218-2.428-.465a4.9 4.9 0 0 1-1.771-1.153a4.9 4.9 0 0 1-1.154-1.772c-.247-.637-.415-1.363-.465-2.428l-.03-.712l-.005-.194A79 79 0 0 1 2 13.028v-2.056a79 79 0 0 1 .022-2.188l.007-.194c.008-.225.018-.446.03-.712c.05-1.065.218-1.79.465-2.428A4.9 4.9 0 0 1 3.68 3.678a4.9 4.9 0 0 1 1.77-1.153c.638-.247 1.363-.415 2.428-.465c.266-.012.488-.022.712-.03l.194-.006a79 79 0 0 1 2.188-.023zM12 7a5 5 0 1 0 0 10a5 5 0 0 0 0-10m0 2a3 3 0 1 1 .001 6a3 3 0 0 1 0-6m5.25-3.5a1.25 1.25 0 0 0 0 2.5a1.25 1.25 0 0 0 0-2.5"
      />
    </AauSvg>
  );
}
