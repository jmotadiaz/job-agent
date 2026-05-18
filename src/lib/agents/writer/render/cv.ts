import React from "react";
import fs from "node:fs";
import path from "node:path";
import { renderToFile, type DocumentProps } from "@react-pdf/renderer";
import { nanoid } from "nanoid";
import { node } from "@/lib/agents/workflows/node";
import { CvTemplate } from "@/lib/writer/templates/cv";
import { log } from "@/lib/utils/log";
import { pdfToImageBase64, pdfPageCount } from "../pdf-to-image";
import { dumpBinary } from "@/lib/utils/dump";
import type { CvSolution } from "../types";

export interface CvRenderInput {
  solution: CvSolution;
  profile: {
    name: string;
    role: string;
    email: string;
    phone: string;
    location: string;
    linkedinUrl: string;
    website?: string;
  };
  outDir: string;
}

export const cvRender = node(async (input: CvRenderInput): Promise<CvSolution> => {
  const { solution, profile, outDir } = input;
  const cvPath = path.join(outDir, "cv.pdf");

  fs.mkdirSync(outDir, { recursive: true });

  const flatBullets = solution.experience.flatMap((e) =>
    e.bullets.map((text) => ({
      company: e.company,
      jobTitle: e.role,
      period: e.period,
      renderedText: text,
      bulletId: nanoid(),
    })),
  );

  await renderToFile(
    React.createElement(CvTemplate, {
      name: profile.name,
      jobTitle: profile.role,
      email: profile.email,
      phone: profile.phone,
      location: profile.location,
      linkedinUrl: profile.linkedinUrl,
      website: profile.website || undefined,
      bullets: flatBullets,
      education: solution.education,
      skillCategories: solution.skillCategories,
    }) as React.ReactElement<DocumentProps>,
    cvPath,
  );

  const [imageBase64, pageCount] = await Promise.all([
    pdfToImageBase64(cvPath),
    pdfPageCount(cvPath),
  ]);

  dumpBinary("cv_visual_input", Buffer.from(imageBase64, "base64"), "png");

  log.info("writer/render/cv", "cv rendered", {
    cvPath,
    size: fs.statSync(cvPath).size,
    imageLength: imageBase64.length,
    pageCount,
  });

  return {
    ...solution,
    pdfPath: cvPath,
    imageBase64,
    pageCount,
  };
});
