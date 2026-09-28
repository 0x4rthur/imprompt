// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { reducedMotion } from "./motion";

describe("motion", () => {
  it("sem matchMedia (ambiente de teste) conta como movimento reduzido", () => {
    expect(reducedMotion()).toBe(true);
  });

  it("respeita prefers-reduced-motion quando o sistema pede", () => {
    const original = window.matchMedia;
    window.matchMedia = ((query: string) => ({ matches: query.includes("reduce"), media: query } as MediaQueryList));
    try {
      expect(reducedMotion()).toBe(true);
      window.matchMedia = ((query: string) => ({ matches: false, media: query } as MediaQueryList));
      expect(reducedMotion()).toBe(false);
    } finally {
      window.matchMedia = original;
    }
  });
});
