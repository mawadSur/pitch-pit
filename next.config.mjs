import { withSentryConfig } from "@sentry/nextjs";

/** @type {import('next').NextConfig} */
const securityHeaders = [
  // Browsers should never serve over HTTP after the first HTTPS hit.
  // 2 years + subdomains + preload-eligible.
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  // Disallow framing — kills clickjacking. Even stricter than X-Frame-Options.
  { key: "X-Frame-Options", value: "DENY" },
  // Don't sniff MIME types — only trust Content-Type from the server.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Send origin only (no path) on cross-origin navigations.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Lock down browser features we don't use.
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
];

const nextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
  images: {
    // Prefer modern formats for next/image — Vercel will use sharp (already
    // a dependency, ^0.34.5) to convert source images to AVIF/WebP at build
    // time and serve the negotiated best fit per Accept header.
    formats: ["image/avif", "image/webp"],
    // Trusted remote hosts for next/image. Add new origins here when we
    // need to render external images via the Image component.
    remotePatterns: [
      // Google avatar host — used for OAuth user avatars (avatar_url from
      // Supabase auth.users.user_metadata).
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
    ],
  },
};

// Sentry build-time wrap. Source maps upload only when SENTRY_AUTH_TOKEN is
// set (CI / Vercel) — local dev builds skip the upload step gracefully.
export default withSentryConfig(nextConfig, {
  // For all available options, see:
  // https://www.npmjs.com/package/@sentry/webpack-plugin#options

  org: "sur-consulting-llc",

  project: "hungergames",

  // Only print logs for uploading source maps in CI
  silent: !process.env.CI,

  // For all available options, see:
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

  // Upload a larger set of source maps for prettier stack traces (increases build time)
  widenClientFileUpload: true,

  // Route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
  // This can increase your server load as well as your hosting bill.
  // Note: Check that the configured route will not match with your Next.js middleware, otherwise reporting of client-
  // side errors will fail.
  tunnelRoute: "/monitoring",

  webpack: {
    // Enables automatic instrumentation of Vercel Cron Monitors. (Does not yet work with App Router route handlers.)
    // See the following for more information:
    // https://docs.sentry.io/product/crons/
    // https://vercel.com/docs/cron-jobs
    automaticVercelMonitors: true,

    // Tree-shaking options for reducing bundle size
    treeshake: {
      // Automatically tree-shake Sentry logger statements to reduce bundle size
      removeDebugLogging: true,
    },
  },
});
