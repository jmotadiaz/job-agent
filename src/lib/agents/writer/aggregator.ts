import fs from "node:fs";
import path from "node:path";
import { node } from "@/lib/agents/workflows/node";
import { log } from "@/lib/utils/log";
import { mergeNode } from "./merge";
import type {
  CvSolution,
  CoverSolution,
  ExperienceEntry,
  SkillCategoryEntry,
  EducationEntry,
} from "./types";
import type { PlanInput } from "./plan/agent";
import type { CvGeneratorInput } from "./generate/cv";
import type { CoverGeneratorInput } from "./generate/cover";

const MODULE = "writer/aggregator";

function parseJsonOrNull<T>(raw: string | null | undefined): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function parseRationale(
  rationaleJson: string | null | undefined,
): { priorityRequirements: string[]; text: string } | null {
  if (!rationaleJson) return null;
  try {
    const parsed = JSON.parse(rationaleJson);
    return {
      priorityRequirements: Array.isArray(parsed.priorityRequirements)
        ? parsed.priorityRequirements
        : [],
      text: typeof parsed.text === "string" ? parsed.text : "",
    };
  } catch {
    return null;
  }
}

function copyPdf(sourcePath: string, outDir: string, name: string): string {
  const destPath = path.join(outDir, `${name}.pdf`);
  try {
    fs.copyFileSync(sourcePath, destPath);
    log.info(MODULE, `copied ${name}.pdf from parent`, {
      source: sourcePath,
      dest: destPath,
    });
  } catch (err) {
    log.warn(MODULE, `failed to copy ${name}.pdf from parent`, {
      source: sourcePath,
      error: err instanceof Error ? err.message : String(err),
    });
  }
  return destPath;
}

export const aggregatorNode = node(
  async (aggInput: {
    results: Partial<{
      cv: {
        accepted: boolean;
        solution: CvSolution;
        iterations: number;
      };
      cover: {
        accepted: boolean;
        solution: CoverSolution;
        iterations: number;
      };
    }>;
    errors: Record<string, unknown>;
    tasks: Partial<{
      cv: CvGeneratorInput;
      cover: CoverGeneratorInput;
    }>;
    input: PlanInput;
  }) => {
    const parentGen = aggInput.input.parentGeneration;
    const outDir = aggInput.input.outDir;

    // Build CV result — either from worker or copied from parent
    let cvResult = aggInput.results.cv;
    if (!cvResult && parentGen) {
      const parentExperience = parseJsonOrNull<ExperienceEntry[]>(
        parentGen.bulletsJson,
      );
      const parentSkillCategories = parseJsonOrNull<SkillCategoryEntry[]>(
        parentGen.skillsJson ?? null,
      );
      const parentEducation = parseJsonOrNull<EducationEntry[]>(
        parentGen.educationJson ?? null,
      );

      if (parentExperience && parentSkillCategories) {
        const cvPath = copyPdf(parentGen.cvPath, outDir, "cv");

        cvResult = {
          accepted: true,
          iterations: 0,
          solution: {
            experience: parentExperience,
            skillCategories: parentSkillCategories,
            education: parentEducation ?? [],
            pdfPath: cvPath,
            imageBase64: "",
            pageCount: 0,
          },
        };
        log.info(MODULE, "cv copied from parent (not edited)");
      }
    }

    // Build Cover result — either from worker or copied from parent
    let coverResult = aggInput.results.cover;
    if (!coverResult && parentGen) {
      const parentCoverParagraphs = parseJsonOrNull<string[]>(
        parentGen.coverParagraphsJson,
      );

      if (parentCoverParagraphs) {
        const coverPath = copyPdf(parentGen.coverPath, outDir, "cover");

        coverResult = {
          accepted: true,
          iterations: 0,
          solution: {
            paragraphs: parentCoverParagraphs,
            pdfPath: coverPath,
            imageBase64: "",
            pageCount: 0,
          },
        };
        log.info(MODULE, "cover copied from parent (not edited)");
      }
    }

    if (!cvResult || !coverResult) {
      const missing = [!cvResult && "cv", !coverResult && "cover"]
        .filter(Boolean)
        .join(", ");

      const firstError = Object.values(aggInput.errors)[0];
      const errorMsg =
        firstError instanceof Error
          ? firstError.message
          : String(firstError ?? "no parent generation to copy from");

      throw new Error(
        `Writer distributed run failed: missing results for ${missing}. First error: ${errorMsg}`,
      );
    }

    // Extract rationale + priorityRequirements from tasks or parent rationale
    let rationale: string;
    let priorityRequirements: string[];

    if (aggInput.tasks.cv) {
      rationale = aggInput.tasks.cv.rationaleDraft;
      priorityRequirements = aggInput.tasks.cv.priorityRequirements;
    } else if (aggInput.tasks.cover) {
      rationale = aggInput.tasks.cover.rationaleDraft;
      priorityRequirements = [];
    } else {
      const parentRationale = parseRationale(parentGen?.rationaleJson);
      rationale = parentRationale?.text ?? "";
      priorityRequirements = parentRationale?.priorityRequirements ?? [];
    }

    return mergeNode.execute({
      cvResult,
      coverResult,
      rationale,
      priorityRequirements,
    });
  },
);
