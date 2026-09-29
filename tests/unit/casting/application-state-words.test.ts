import { describe, expect, it } from "vitest";
import { applicationStateEnum } from "@/modules/casting/schema";
import { de } from "@/ui/strings/de";

// D9: the eleven state words of rahmenwerk.md §8.6. A state added to the enum later fails here
// instead of rendering as `undefined` in the pipeline.
describe("de.status.application", () => {
  it("has a word for every application state, and no other key", () => {
    expect(new Set(Object.keys(de.status.application))).toEqual(new Set(applicationStateEnum.enumValues));
  });

  it("carries the §8.6 words verbatim", () => {
    expect(de.status.application).toEqual({
      new: "Neu",
      screened: "Gesichtet",
      invited: "Eingeladen",
      scheduled: "Termin steht",
      interviewed: "Kennengelernt",
      offer_made: "Zusage erteilt",
      moved_in: "Eingezogen",
      rejected_by_household: "Abgesagt (von uns)",
      declined_by_applicant: "Abgesagt (von der Person)",
      withdrawn: "Zurückgezogen",
      archived: "Archiviert",
    });
  });
});
