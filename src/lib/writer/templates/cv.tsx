import React from "react";
import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";

const ACCENT = "#B8960C";
const MUTED = "#888888";
const PRIMARY = "#1a1a1a";
const SECONDARY = "#666666";

const styles = StyleSheet.create({
  page: {
    flexDirection: "row",
    fontFamily: "Helvetica",
    fontSize: 9,
    color: PRIMARY,
    backgroundColor: "#ffffff",
  },
  leftCol: {
    width: "58%",
    paddingTop: 44,
    paddingLeft: 44,
    paddingRight: 22,
    paddingBottom: 44,
  },
  rightCol: {
    width: "42%",
    paddingTop: 44,
    paddingLeft: 22,
    paddingRight: 36,
    paddingBottom: 44,
  },
  name: {
    fontSize: 28,
    fontFamily: "Helvetica-Bold",
    color: PRIMARY,
    marginBottom: 4,
  },
  jobTitleText: {
    fontSize: 13,
    color: SECONDARY,
    marginBottom: 26,
  },
  sectionLabel: {
    fontSize: 7,
    letterSpacing: 2.5,
    color: MUTED,
    marginBottom: 14,
    marginTop: 14,
  },
  expBlock: {
    marginBottom: 20,
  },
  expJobTitle: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    color: PRIMARY,
    marginBottom: 8,
  },
  expCompany: {
    fontSize: 9.5,
    color: PRIMARY,
    marginBottom: 8,
  },
  expPeriod: {
    fontSize: 8.5,
    color: MUTED,
    marginBottom: 5,
  },
  expDescription: {
    fontSize: 9.5,
    lineHeight: 1.55,
    color: PRIMARY,
    marginBottom: 5,
  },
  eduBlock: {
    marginBottom: 12,
  },
  eduDegree: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: PRIMARY,
    marginBottom: 2,
  },
  eduInstitution: {
    fontSize: 9,
    color: PRIMARY,
    marginBottom: 2,
  },
  eduPeriod: {
    fontSize: 8.5,
    color: MUTED,
  },
  contactItem: {
    fontSize: 9,
    color: MUTED,
    marginBottom: 5,
  },
  skillSectionHeader: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: ACCENT,
    marginTop: 20,
    marginBottom: 7,
  },
  skillItem: {
    fontSize: 9,
    color: MUTED,
    marginBottom: 4,
    lineHeight: 1.35,
  },
});

export interface BulletItem {
  bulletId: string;
  renderedText: string;
  jobTitle?: string;
  company?: string;
  period?: string;
}

export interface SkillCategory {
  label: string;
  items: string[];
}

export interface CvTemplateProps {
  name: string;
  jobTitle?: string;
  email?: string;
  phone?: string;
  location?: string;
  linkedin?: string;
  website?: string;
  summary?: string;
  bullets: BulletItem[];
  skills?: string[];
  skillCategories?: SkillCategory[];
  education?: Array<{ institution: string; degree: string; period: string }>;
}

interface JobGroup {
  jobTitle: string;
  company: string;
  period: string;
  descriptions: string[];
}

function groupBulletsByJob(bullets: BulletItem[]): {
  grouped: JobGroup[];
  ungrouped: string[];
} {
  const grouped: JobGroup[] = [];
  const ungrouped: string[] = [];

  for (const b of bullets) {
    if (b.jobTitle && b.company) {
      const key = `${b.jobTitle}|${b.company}`;
      const existing = grouped.find(
        (g) => `${g.jobTitle}|${g.company}` === key,
      );
      if (existing) {
        existing.descriptions.push(b.renderedText);
      } else {
        grouped.push({
          jobTitle: b.jobTitle,
          company: b.company,
          period: b.period ?? "",
          descriptions: [b.renderedText],
        });
      }
    } else {
      ungrouped.push(b.renderedText);
    }
  }

  return { grouped, ungrouped };
}

export function CvTemplate({
  name,
  jobTitle,
  email,
  phone,
  location,
  linkedin,
  website,
  summary,
  bullets,
  skills = [],
  skillCategories = [],
  education = [],
}: CvTemplateProps) {
  const contactItems = [email, phone, location, linkedin, website].filter(
    Boolean,
  ) as string[];
  const { grouped, ungrouped } = groupBulletsByJob(bullets);

  const renderedCategories: SkillCategory[] =
    skillCategories.length > 0
      ? skillCategories
      : skills.length > 0
        ? [{ label: "Skills", items: skills }]
        : [];

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* LEFT COLUMN */}
        <View style={styles.leftCol}>
          <Text style={styles.name}>{name}</Text>
          {jobTitle && <Text style={styles.jobTitleText}>{jobTitle}</Text>}

          {/* Experience — grouped by job */}
          {(grouped.length > 0 || ungrouped.length > 0) && (
            <>
              <Text style={styles.sectionLabel}>EXPERIENCE</Text>

              {grouped.map((job, i) => (
                <View key={i} style={styles.expBlock}>
                  <Text style={styles.expJobTitle}>{job.jobTitle}</Text>
                  <Text style={styles.expCompany}>{job.company}</Text>
                  <Text style={styles.expPeriod}>{job.period}</Text>
                  {job.descriptions.map((desc, j) => (
                    <Text key={j} style={styles.expDescription}>
                      {desc}
                    </Text>
                  ))}
                </View>
              ))}

              {/* Fallback: bullets without job metadata */}
              {ungrouped.length > 0 && (
                <View style={styles.expBlock}>
                  {ungrouped.map((desc, i) => (
                    <Text key={i} style={styles.expDescription}>
                      {desc}
                    </Text>
                  ))}
                </View>
              )}
            </>
          )}

          {/* Profile / Summary */}
          {summary && (
            <>
              <Text style={styles.sectionLabel}>PROFILE</Text>
              <Text style={styles.expDescription}>{summary}</Text>
            </>
          )}

          {/* Education */}
          {education.length > 0 && (
            <>
              <Text style={styles.sectionLabel}>EDUCATION</Text>
              {education.map((e, i) => (
                <View key={i} style={styles.eduBlock}>
                  <Text style={styles.eduDegree}>{e.degree}</Text>
                  <Text style={styles.eduInstitution}>{e.institution}</Text>
                  <Text style={styles.eduPeriod}>{e.period}</Text>
                </View>
              ))}
            </>
          )}
        </View>

        {/* RIGHT COLUMN */}
        <View style={styles.rightCol}>
          {contactItems.map((c, i) => (
            <Text key={i} style={styles.contactItem}>
              {c}
            </Text>
          ))}

          {renderedCategories.map((cat, i) => (
            <View key={i}>
              <Text style={styles.skillSectionHeader}>{cat.label}</Text>
              {cat.items.map((item, j) => (
                <Text key={j} style={styles.skillItem}>
                  {item}
                </Text>
              ))}
            </View>
          ))}
        </View>
      </Page>
    </Document>
  );
}
