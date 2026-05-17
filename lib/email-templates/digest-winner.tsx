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

// Monday-morning winner announcement template.
// Fires from /api/cron/email-winner at Tue 13:00 UTC (≈8 AM EST winter),
// 8 hours after the close-week cron has run. If no winner exists yet
// (close hasn't fired) the cron route skips the send entirely.

interface DigestWinnerProps {
  winnerTitle: string;
  winnerUrl: string;
  winnerScore: number;
  weekNumber: number;
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

export function DigestWinner({
  winnerTitle,
  winnerUrl,
  winnerScore,
  weekNumber,
  siteUrl,
  unsubscribeUrl,
}: DigestWinnerProps) {
  return (
    <Html>
      <Head />
      <Preview>{`Week ${weekNumber} winner: ${winnerTitle}. New week is open.`}</Preview>
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
            pitch-pit · week {weekNumber}
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
            This week&rsquo;s{" "}
            <span style={{ fontStyle: "italic", color: COLORS.gold }}>
              winner
            </span>
            .
          </Heading>

          {/* Winner card */}
          <Section
            style={{
              backgroundColor: COLORS.panel,
              border: `1px solid ${COLORS.border}`,
              borderRadius: "12px",
              padding: "32px 28px",
              margin: "0 0 28px 0",
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
              Final score
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
              {winnerScore}
              <span
                style={{
                  fontSize: "20px",
                  color: COLORS.textMuted,
                  marginLeft: "4px",
                }}
              >
                /100
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
              {winnerTitle}
            </Heading>
            <Button
              href={winnerUrl}
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
              See the winner →
            </Button>
          </Section>

          <Text
            style={{
              fontSize: "16px",
              lineHeight: 1.6,
              color: COLORS.textMuted,
              margin: "0 0 24px 0",
            }}
          >
            The build is in motion. Their MVP will ship under their name
            this week — keep an eye on{" "}
            <Link href={`${siteUrl}/built`} style={{ color: COLORS.gold }}>
              /built
            </Link>{" "}
            for the launch.
          </Text>

          {/* New-week CTA */}
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
                margin: "0 0 10px 0",
              }}
            >
              The pit is open again
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
              Your idea could win{" "}
              <span style={{ fontStyle: "italic", color: COLORS.gold }}>
                next
              </span>
              .
            </Text>
            <Button
              href={siteUrl}
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
            You&rsquo;re on the pitch-pit list because you opted in. Two
            notes a week, never more.{" "}
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

export default DigestWinner;
