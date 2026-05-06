// Server component that emits a single JSON-LD <script> tag.
// Used to attach schema.org structured data to a route. Rendering is
// inert (script type="application/ld+json" is opaque to the browser
// renderer) so the only side effect is making the data available to
// search engines and other consumers that parse structured data.
//
// JSON.stringify is sufficient for sanitization here because the
// payload type forbids functions/symbols and we never embed it into
// raw HTML — the browser parses it as a typed script body, not HTML.
// We escape `<` defensively in case any string field ever contains
// "</script>" (would otherwise close the tag early).

type JsonLdValue =
  | string
  | number
  | boolean
  | null
  | readonly JsonLdValue[]
  | { readonly [key: string]: JsonLdValue | undefined };

export type JsonLdData = {
  readonly "@context": "https://schema.org";
  readonly "@type": string;
  readonly [key: string]: JsonLdValue | undefined;
};

export function JsonLd({ data }: { data: JsonLdData }) {
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: json }}
    />
  );
}
