import React from "react";
import fs from "node:fs";
import path from "node:path";
import { renderToFile, type DocumentProps } from "@react-pdf/renderer";
import { node } from "@/lib/agents/workflows/node";
import { CoverLetterTemplate } from "@/lib/writer/templates/cover-letter";
import { log } from "@/lib/utils/log";
import { pdfToImageBase64, pdfPageCount } from "../pdf-to-image";
import { dumpBinary } from "@/lib/utils/dump";
import type { CoverSolution } from "../types";

export interface CoverRenderInput {
  solution: CoverSolution;
  profile: {
    name: string;
    role: string;
    email: string;
    phone: string;
    linkedinUrl: string;
  };
  job: {
    company: string;
    title: string;
  };
  outDir: string;
}

export const coverRender = node(async (input: CoverRenderInput): Promise<CoverSolution> => {
  const { solution, profile, job, outDir } = input;
  const coverPath = path.join(outDir, "cover.pdf");

  fs.mkdirSync(outDir, { recursive: true });

  await renderToFile(
    React.createElement(CoverLetterTemplate, {
      senderName: profile.name,
      senderRole: profile.role,
      senderEmail: profile.email,
      senderPhone: profile.phone,
      senderLinkedin: profile.linkedinUrl,
      companyName: job.company,
      jobTitle: job.title,
      paragraphs: solution.paragraphs,
    }) as React.ReactElement<DocumentProps>,
    coverPath,
  );

  const [imageBase64, pageCount] = await Promise.all([
    pdfToImageBase64(coverPath),
    pdfPageCount(coverPath),
  ]);

  dumpBinary("cover_visual_input", Buffer.from(imageBase64, "base64"), "png");

  log.info("writer/render/cover", "cover rendered", {
    coverPath,
    size: fs.statSync(coverPath).size,
    imageLength: imageBase64.length,
    pageCount,
  });

  return {
    ...solution,
    pdfPath: coverPath,
    imageBase64,
    pageCount,
  };
});
