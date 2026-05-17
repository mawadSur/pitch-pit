import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";

// Sunday-evening reminder template: "6 hours left to pitch this week."
// Fires from /api/cron/email-countdown at Sun 23:00 UTC (≈Sun 6 PM EST).
// One subscriber per render — Resend's batch endpoint handles fan-out.
//
// Style constraints:
//   - Inline CSS only. Email clients (Gmail, Outlook) strip <style> tags
//     and most don't load external stylesheets at all.
//   - No webfont loading via <link>; we declare Fraunces/Inter in the
//     font-family stack with system fallbacks so quiet failure looks
//     reasonable even when the network blocks the font CDN.
//   - Black bg + gold accents — minimalist aesthetic, NOT the legacy
//     Capitol palette.

interface DigestCountdownProps {
  siteUrl: string;
  unsubscribeUrl: string;
}

const COLORS = {
  bg: "#000000",
  panel: "#0a0a0a",
  border: "rgba(255,255,255,0.08)",
  text: "#ffffff",
  textMuted: "rgba(255,255,255,0.65)",
  gold: "#FFB800",
  goldDim: "rgba(255,184,0,0.78)",
};

const FONT_SERIF =
  '"Fraunces","Times New Roman",Georgia,serif';
const FONT_SANS =
  'Inter,"Helvetica Neue",Helvetica,Arial,sans-serif';

export function DigestCountdown({
  siteUrl,
  unsubscribeUrl,
}: DigestCountdownProps) {
  return (
    <Html>
      <Head />
      <Preview>The pit closes Monday at midnight EST. Six hours.</Preview>
      <Body
        style={{
          backgroundColor: COLORS.bg,
          margin: 0,
          padding: 0,
          fontFamily: FONT_SANS,
          color: COLORS.text,
        }}
      >
        <Container
          style={{
            maxWidth: "560px",
            margin: "0 auto",
            padding: "48px 24px",
          }}
        >
          {/* Wordmark */}
          <Text
            style={{
              fontFamily: FONT_SANS,
              fontSize: "11px",
              letterSpacing: "0.4em",
              textTransform: "uppercase",
              color: COLORS.goldDim,
              margin: "0 0 32px 0",
            }}
          >
            pitch-pit
          </Text>

          {/* Headline */}
          <Heading
            as="h1"
            style={{
              fontFamily: FONT_SERIF,
              fontSize: "40px",
              lineHeight: 1.1,
              fontWeight: 500,
              margin: "0 0 20px 0",
              color: COLORS.text,
            }}
          >
            Six hours left to{" "}
            <span style={{ fontStyle: "italic", color: COLORS.gold }}>
              pitch
            </span>{" "}
            this week.
          </Heading>

          <Text
            style={{
              fontSize: "16px",
              lineHeight: 1.6,
              color: COLORS.textMuted,
              margin: "0 0 28px 0",
            }}
          >
            The pit closes Monday at midnight EST. One idea wins. We build
            its MVP — for free, under the founder&rsquo;s name — and
            broadcast it. The hourglass is in its last grain.
          </Text>

          <Section
            style={{
              backgroundColor: COLORS.panel,
              border: `1px solid ${COLORS.border}`,
              borderRadius: "12px",
              padding: "24px 28px",
              margin: "0 0 32px 0",
            }}
          >
            <Text
              style={{
                fontSize: "11px",
                letterSpacing: "0.32em",
                textTransform: "uppercase",
                color: COLORS.goldDim,
                margin: "0 0 12px 0",
              }}
            >
              The pact
            </Text>
            <Text
              style={{
                fontSize: "15px",
                lineHeight: 1.65,
                color: COLORS.textMuted,
                margin: 0,
              }}
            >
              60 characters minimum. Two submissions per week. No equity,
              no fees. Monday at midnight, one winner walks out with a
              build.
            </Text>
          </Section>

          {/* Primary CTA */}
          <Section style={{ textAlign: "center", margin: "0 0 40px 0" }}>
            <Button
              href={siteUrl}
              style={{
                backgroundColor: COLORS.gold,
                color: "#1a0f00",
                fontFamily: FONT_SANS,
                fontSize: "14px",
                fontWeight: 600,
                letterSpacing: "0.04em",
                padding: "14px 32px",
                borderRadius: "9999px",
                textDecoration: "none",
                display: "inline-block",
              }}
            >
              Pitch your idea →
            </Button>
          </Section>

          <Hr style={{ borderColor: COLORS.border, margin: "32px 0" }} />

          <Text
            style={{
              fontSize: "12px",
              lineHeight: 1.6,
              color: "rgba(255,255,255,0.42)",
              margin: 0,
            }}
          >
            You&rsquo;re hearing from pitch-pit because you opted in. No
            sales, no upsells — one note Sunday, one note Monday.{" "}
            <Link
              href={unsubscribeUrl}
              style={{
                color: "rgba(255,255,255,0.6)",
                textDecoration: "underline",
              }}
            >
              Unsubscribe
            </Link>
            .
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export default DigestCountdown;
