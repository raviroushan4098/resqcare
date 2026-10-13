"use client";

/**
 * Last-resort boundary when the root layout itself fails. No providers or
 * translations are available here, so it is static and bilingual.
 */
export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", background: "#F7FAFC", color: "#12284C", margin: 0, padding: 16 }}>
        <main style={{ maxWidth: 560, margin: "40px auto", textAlign: "center" }}>
          <h1>Something went wrong / कुछ गड़बड़ हुई</h1>
          <p>In an emergency, call now. / आपात स्थिति में अभी कॉल करें।</p>
          <p>
            <a href="tel:112" style={{ display: "inline-block", background: "#C62828", color: "#fff", padding: "16px 24px", borderRadius: 12, fontWeight: 700, fontSize: 20, textDecoration: "none" }}>
              Call 112
            </a>{" "}
            <a href="tel:108" style={{ display: "inline-block", border: "2px solid #C62828", color: "#C62828", padding: "14px 20px", borderRadius: 12, fontWeight: 700 }}>108</a>{" "}
            <a href="tel:102" style={{ display: "inline-block", border: "2px solid #C62828", color: "#C62828", padding: "14px 20px", borderRadius: 12, fontWeight: 700 }}>102</a>
          </p>
          <button type="button" onClick={reset} style={{ minHeight: 44, padding: "0 16px", borderRadius: 12, border: "1px solid #7A8DA3", background: "#fff" }}>
            Try again / फिर से कोशिश करें
          </button>
        </main>
      </body>
    </html>
  );
}
