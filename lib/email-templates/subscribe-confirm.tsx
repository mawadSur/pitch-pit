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

// Double-opt-in confirmation request. POST /api/subscribe inserts a row
// with status='pending' and sends this email; GET on the magic link
// (/api/subscribe/confirm/[token]) flips the row to status='active'.
// Anyone forwarded the link can't subscribe a stranger because we
// require the click-through from a freshly-minted unique token.

interface SubscribeConfirmProps {
  confirmUrl: string;
  siteUrl: string;
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

export function SubscribeConfirm({
  confirmUrl,
  siteUrl,
}: SubscribeConfirmProps) {
  return (
    <Html>
      <Head />
      <Preview>Confirm your subscription to pitch-pit.</Preview>
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
            pitch-pit
          </Text>

          <Heading
            as="h1"
            style={{
              fontFamily: FONT_SERIF,
              fontSize: "36px",
              lineHeight: 1.1,
              fontWeight: 500,
              margin: "0 0 20px 0",
              color: COLORS.text,
            }}
          >
            Confirm you&rsquo;re{" "}
            <span style={{ fontStyle: "italic", color: COLORS.gold }}>
              in
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
            Click the button below to confirm your subscription. You&rsquo;ll
            get two notes a week:
          </Text>

          <Section
            style={{
              backgroundColor: COLORS.panel,
              border: `1px solid ${COLORS.border}`,
              borderRadius: "12px",
              padding: "20px 28px",
              margin: "0 0 32px 0",
            }}
          >
            <Text
              style={{
                fontSize: "14px",
                lineHeight: 1.7,
                color: COLORS.textMuted,
                margin: 0,
              }}
            >
              <span style={{ color: COLORS.gold }}>Sunday 6 PM EST</span> —
              countdown reminder. The pit closes Monday at midnight.
              <br />
              <span style={{ color: COLORS.gold }}>Monday morning</span> —
              this week&rsquo;s winner. We build their idea.
            </Text>
          </Section>

          <Section style={{ textAlign: "center", margin: "0 0 32px 0" }}>
            <Button
              href={confirmUrl}
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
              Confirm subscription →
            </Button>
          </Section>

          <Text
            style={{
              fontSize: "13px",
              lineHeight: 1.65,
              color: "rgba(255,255,255,0.5)",
              margin: "0 0 16px 0",
            }}
          >
            If the button doesn&rsquo;t work, paste this into your browser:
          </Text>
          <Text
            style={{
              fontFamily:
                'ui-monospace,SFMono-Regular,"SF Mono",Menlo,monospace',
              fontSize: "12px",
              lineHeight: 1.5,
              color: "rgba(255,255,255,0.6)",
              wordBreak: "break-all",
              margin: 0,
            }}
          >
            <Link href={confirmUrl} style={{ color: COLORS.gold }}>
              {confirmUrl}
            </Link>
          </Text>

          <Hr style={{ borderColor: COLORS.border, margin: "32px 0" }} />

          <Text
            style={{
              fontSize: "12px",
              lineHeight: 1.6,
              color: "rgba(255,255,255,0.42)",
              margin: 0,
            }}
          >
            Didn&rsquo;t request this? Ignore the email — you won&rsquo;t
            hear from us again. We never send anything before you confirm.{" "}
            <Link href={siteUrl} style={{ color: "rgba(255,255,255,0.6)" }}>
              pitch-pit
            </Link>
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export default SubscribeConfirm;
