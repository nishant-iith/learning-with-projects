import { describe, it, expect } from "vitest";
import { Calculator } from "./index.js";

describe("Calculator", () => {
  it("should add numbers correctly", () => {
    const calc = new Calculator();
    expect(calc.add(2, 3)).toBe(5);
  });

  it("should subtract numbers correctly", () => {
    const calc = new Calculator();
    expect(calc.subtract(10, 4)).toBe(6);
  });
});
