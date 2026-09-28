// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { reducedMotion, useCountUp } from "./motion";

describe("motion", () => {
  it("sem matchMedia (ambiente de teste) conta como movimento reduzido", () => {
    expect(reducedMotion()).toBe(true);
  });

  it("useCountUp mostra o valor final na hora quando o movimento é reduzido", () => {
    const { result, rerender } = renderHook(({ v }) => useCountUp(v), { initialProps: { v: 132 } });
    expect(result.current).toBe(132);
    rerender({ v: 140 });
    expect(result.current).toBe(140);
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
