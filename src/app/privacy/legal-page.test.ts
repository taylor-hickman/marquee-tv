import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import TermsPage from "../terms/page";
import PrivacyPage from "./page";

const html = (page: () => React.ReactElement) =>
  renderToStaticMarkup(createElement(page));

describe("legal pages render docs/legal/ as HTML", () => {
  test("/privacy says the app uses YouTube API Services and links Google's privacy policy", () => {
    const page = html(PrivacyPage);
    expect(page).toContain("<h1>Privacy policy</h1>");
    expect(page).toContain("Draft, not yet reviewed by counsel.");
    expect(page).toContain("uses YouTube API Services");
    expect(page).toContain('href="https://policies.google.com/privacy"');
  });

  test("/terms binds users to YouTube's Terms of Service", () => {
    const page = html(TermsPage);
    expect(page).toContain("<h1>Terms of service</h1>");
    expect(page).toContain("Draft, not yet reviewed by counsel.");
    expect(page).toContain("agree to be bound by the YouTube Terms of Service");
    expect(page).toContain('href="https://www.youtube.com/t/terms"');
  });
});
