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

// Sunday-evening reminder template: "6 hours left — here's the race."
// Fires from /api/cron/email-countdown at Sun 23:00 UTC (≈Sun 6 PM EST).
// One subscriber per render — Resend's batch endpoint handles fan-out.
//
// Goes ONLY to opted-in marketing subscribers (status = 'active'). It is
// NOT sent to non-consented past voters — that would require a separate
// consent review (see the route's TODO(consent)).
//
// The body now leads with the LIVE race: the open week's top-3 by
// final_score as deep links (with ?utm_source=countdown) and the
// #1↔#2 point gap, so the CTA is "go vote", not just "the clock is
// running". When the route can't supply contenders yet (week just opened,
// nothing scored) the block is omitted and the original deadline copy
// stands on its own.
//
// Style constraints:
//   - Inline CSS only. Email clients (Gmail, Outlook) strip <style> tags
//     and most don't load external stylesheets at all.
//   - No webfont loading via <link>; we declare Fraunces/Inter in the
//     font-family stack with system fallbacks so quiet failure looks
//     reasonable even when the network blocks the font CDN.
//   - Black bg + gold accents — minimalist aesthetic, NOT the legacy
//     Capitol palette.

export interface CountdownContender {
  rank: number;
  title: string;
  // Deep link to /idea/<id>/<slug>?utm_source=countdown (built by route).
  url: string;
  finalScore: number;
}

interface DigestCountdownProps {
  siteUrl: string;
  unsubscribeUrl: string;
  // Open-week top-3 by final_score. Empty when nothing is scored yet.
  contenders?: CountdownContender[];
  // #1 ↔ #2 point gap. Null when fewer than two scored contenders exist.
  leadGap?: number | null;
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
  contenders = [],
  leadGap = null,
}: DigestCountdownProps) {
  const hasRace = contenders.length > 0;
  const gapLine =
    leadGap != null
      ? leadGap === 0
        ? "The top two are dead even."
        : `The lead is just ${leadGap} point${leadGap === 1 ? "" : "s"}.`
      : null;
  const previewText = gapLine
    ? `${gapLine} Six hours left to vote. Pit closes Monday midnight EST.`
    : "The pit closes Monday at midnight EST. Six hours.";

  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
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
            {hasRace ? (
              <>
                Six hours left to{" "}
                <span style={{ fontStyle: "italic", color: COLORS.gold }}>
                  vote
                </span>
                .
              </>
            ) : (
              <>
                Six hours left to{" "}
                <span style={{ fontStyle: "italic", color: COLORS.gold }}>
                  pitch
                </span>{" "}
                this week.
              </>
            )}
          </Heading>

          <Text
            style={{
              fontSize: "16px",
              lineHeight: 1.6,
              color: COLORS.textMuted,
              margin: "0 0 28px 0",
            }}
          >
            {hasRace && gapLine ? (
              <>
                {gapLine} The pit closes Monday at midnight EST — your vote
                is half the score. One idea wins a free MVP build under the
                founder&rsquo;s name.
              </>
            ) : (
              <>
                The pit closes Monday at midnight EST. One idea wins. We
                build its MVP — for free, under the founder&rsquo;s name —
                and broadcast it. The hourglass is in its last grain.
              </>
            )}
          </Text>

          {/* Live race — open-week top-3 as deep links. Omitted entirely
              when nothing is scored yet. */}
          {hasRace && (
            <Section
              style={{
                backgroundColor: COLORS.panel,
                border: `1px solid ${COLORS.border}`,
                borderRadius: "12px",
                padding: "24px 28px",
                margin: "0 0 24px 0",
              }}
            >
              <Text
                style={{
                  fontSize: "11px",
                  letterSpacing: "0.32em",
                  textTransform: "uppercase",
                  color: COLORS.goldDim,
                  margin: "0 0 16px 0",
                }}
              >
                The race right now
              </Text>
              {contenders.map((c, i) => (
                <Section
                  key={c.url}
                  style={{
                    margin: i === contenders.length - 1 ? "0" : "0 0 14px 0",
                  }}
                >
                  <Link
                    href={c.url}
                    style={{
                      color: COLORS.text,
                      textDecoration: "none",
                      fontSize: "16px",
                      lineHeight: 1.4,
                    }}
                  >
                    <span
                      style={{
                        fontFamily: FONT_SERIF,
                        color: COLORS.gold,
                        marginRight: "10px",
                      }}
                    >
                      #{c.rank}
                    </span>
                    {c.title}
                    <span
                      style={{
                        color: COLORS.textMuted,
                        marginLeft: "8px",
                        fontSize: "14px",
                      }}
                    >
                      · {c.finalScore}/100
                    </span>
                  </Link>
                </Section>
              ))}
              <Text
                style={{
                  fontSize: "13px",
                  lineHeight: 1.6,
                  color: COLORS.textMuted,
                  margin: "16px 0 0 0",
                }}
              >
                Tap any contender to read the pitch and cast your vote.
              </Text>
            </Section>
          )}

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

          {/* Primary CTA — "cast your vote" into the live leaderboard when
              there's a race, otherwise the classic "pitch your idea". */}
          <Section style={{ textAlign: "center", margin: "0 0 40px 0" }}>
            <Button
              href={
                hasRace
                  ? `${siteUrl}/leaderboard?utm_source=countdown`
                  : siteUrl
              }
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
              {hasRace ? "Cast your vote →" : "Pitch your idea →"}
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
