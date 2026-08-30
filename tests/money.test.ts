import assert from "node:assert/strict";
import test from "node:test";
import { parseCnbTxt } from "../src/lib/cnb.ts";
import { parseAmountToMinor, toCzkHaler } from "../src/lib/money.ts";

test("ČNB txt parse", () => {
  const quote = parseCnbTxt(`29.08.2026 #168
země|měna|množství|kód|kurz
EMU|euro|1|EUR|24,580
`);
  assert.equal(quote.validFor, "2026-08-29");
  assert.equal(quote.eur, 24.58);
});

test("euro cents become Kč haléře", () => {
  const czk = toCzkHaler(
    {
      id: "1",
      date: "2026-08-05",
      direction: "out",
      currency: "EUR",
      minor: 1499,
      category: "Games",
      note: "Steam",
      createdAt: "2026-08-05T00:00:00.000Z",
    },
    24.58,
  );
  assert.equal(czk, -36845);
});

test("amount parser", () => {
  assert.equal(parseAmountToMinor("14,99"), 1499);
  assert.equal(parseAmountToMinor("1 247"), 124700);
});
