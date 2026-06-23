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

// Per-voter "how your pick placed" result email.
// Fires from /api/cron/email-voter-results once a week's results are
// frozen. This reaches signed-in VOTERS — people who cast a vote but may
// never have opted into marketing email — so the whole send is gated
// behind VOTER_RESULTS_EMAIL_ENABLED in the route and framed strictly
// transactionally: the direct outcome of an action they took (their
// vote). One-tap unsubscribe is mandatory.
//
// Style constraints (mirror digest-winner.tsx):
//   - Inline CSS only — clients strip <style> tags + external sheets.
//   - No <link> webfonts; Fraunces/Inter declared with system fallbacks.
//   - Black bg + gold accents — minimalist aesthetic, NOT legacy Capitol.

interface VoterPick {
  // The idea the recipient voted for.
  title: string;
  url: string;
  // Where it landed in the frozen week results.
  rank: number;
}

interface DigestVoterResultProps {
  // One block per idea the recipient voted for (a voter can back multiple
  // ideas in a week). Ordered best-placing first by the route.
  picks: VoterPick[];
  // Total ranked ideas in the week — the "of M" denominator.
  totalRanked: number;
  weekNumber: number;
  // The week's #1 idea, for context even when none of the picks won.
  winnerTitle: string;
  winnerUrl: string;
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

const FONT_SERIF = '"Fraunces","Times New Roman",Georgia,serif';
const FONT_SANS = 'Inter,"Helvetica Neue",Helvetica,Arial,sans-serif';

// Ordinal suffix for the rank numeral ("1st", "2nd", "3rd", "11th").
function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

export function DigestVoterResult({
  picks,
  totalRanked,
  weekNumber,
  winnerTitle,
  winnerUrl,
  siteUrl,
  unsubscribeUrl,
}: DigestVoterResultProps) {
  const topPick = picks[0];
  const topPickWon = topPick != null && topPick.rank === 1;
  const previewText = topPick
    ? `Your pick finished ${ordinal(topPick.rank)} of ${totalRanked} this week.`
    : `Week ${weekNumber} results are in.`;

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
            pitch-pit · week {weekNumber} results
          </Text>

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
            The vote you{" "}
            <span style={{ fontStyle: "italic", color: COLORS.gold }}>
              cast
            </span>
            .
          </Heading>

          <Text
            style={{
              fontSize: "16px",
              lineHeight: 1.6,
              color: COLORS.textMuted,
              margin: "0 0 28px 0",
            }}
          >
            {topPickWon
              ? "You backed the winner. Here's where your pick landed when the pit closed."
              : "The pit has closed and the scores are frozen. Here's where the idea you backed landed."}
          </Text>

          {/* One result card per pick. */}
          {picks.map((pick, i) => (
            <Section
              key={`${pick.url}-${i}`}
              style={{
                backgroundColor: COLORS.panel,
                border: `1px solid ${COLORS.border}`,
                borderRadius: "12px",
                padding: "32px 28px",
                margin: "0 0 20px 0",
                textAlign: "center",
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
                Your pick finished
              </Text>
              <Text
                style={{
                  fontFamily: FONT_SERIF,
                  fontSize: "48px",
                  fontWeight: 600,
                  color: COLORS.gold,
                  margin: "0 0 16px 0",
                  lineHeight: 1,
                }}
              >
                #{pick.rank}
                <span
                  style={{
                    fontSize: "20px",
                    color: COLORS.textMuted,
                    marginLeft: "6px",
                  }}
                >
                  of {totalRanked}
                </span>
              </Text>
              <Heading
                as="h2"
                style={{
                  fontFamily: FONT_SERIF,
                  fontSize: "26px",
                  fontWeight: 500,
                  color: COLORS.text,
                  margin: "0 0 20px 0",
                  lineHeight: 1.2,
                }}
              >
                {pick.title}
              </Heading>
              <Button
                href={pick.url}
                style={{
                  backgroundColor: COLORS.gold,
                  color: "#1a0f00",
                  fontFamily: FONT_SANS,
                  fontSize: "13px",
                  fontWeight: 600,
                  letterSpacing: "0.04em",
                  padding: "12px 24px",
                  borderRadius: "9999px",
                  textDecoration: "none",
                  display: "inline-block",
                }}
              >
                See the result →
              </Button>
            </Section>
          ))}

          {/* Winner context — only when the recipient's top pick didn't win. */}
          {!topPickWon && (
            <Section
              style={{
                backgroundColor: COLORS.panel,
                border: `1px solid ${COLORS.border}`,
                borderRadius: "12px",
                padding: "24px 28px",
                margin: "8px 0 32px 0",
              }}
            >
              <Text
                style={{
                  fontSize: "11px",
                  letterSpacing: "0.32em",
                  textTransform: "uppercase",
                  color: COLORS.goldDim,
                  margin: "0 0 10px 0",
                }}
              >
                This week&rsquo;s winner
              </Text>
              <Text
                style={{
                  fontFamily: FONT_SERIF,
                  fontSize: "22px",
                  fontWeight: 500,
                  color: COLORS.text,
                  margin: "0 0 16px 0",
                  lineHeight: 1.25,
                }}
              >
                {winnerTitle}
              </Text>
              <Button
                href={winnerUrl}
                style={{
                  backgroundColor: "transparent",
                  color: COLORS.gold,
                  fontFamily: FONT_SANS,
                  fontSize: "13px",
                  fontWeight: 600,
                  letterSpacing: "0.04em",
                  padding: "10px 22px",
                  borderRadius: "9999px",
                  textDecoration: "none",
                  border: `1px solid ${COLORS.gold}`,
                  display: "inline-block",
                }}
              >
                See the winner →
              </Button>
            </Section>
          )}

          {/* New-week CTA back to the site. */}
          <Text
            style={{
              fontSize: "16px",
              lineHeight: 1.6,
              color: COLORS.textMuted,
              margin: topPickWon ? "8px 0 24px 0" : "0 0 24px 0",
            }}
          >
            A new week is open. Cast your next vote — or pitch an idea of
            your own and let the pit decide.
          </Text>

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
              Back to pitch-pit →
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
            You&rsquo;re getting this because you voted on pitch-pit this
            week — it&rsquo;s the result of the vote you cast, nothing more.{" "}
            <Link
              href={unsubscribeUrl}
              style={{
                color: "rgba(255,255,255,0.6)",
                textDecoration: "underline",
              }}
            >
              Unsubscribe from result emails
            </Link>
            .
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export default DigestVoterResult;
