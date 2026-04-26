import React from "react";
import path from "path";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
  Link,
} from "@react-pdf/renderer";

// Disable hyphenation to prevent splitting words (e.g., ENGI-NEER)
Font.registerHyphenationCallback((word) => [word]);

const fontsDir = path.join(process.cwd(), "src/lib/writer/templates/fonts");

// Register Montserrat font using local files to avoid network issues
Font.register({
  family: "Montserrat",
  fonts: [
    {
      src: path.join(fontsDir, "montserrat-v31-latin-regular.ttf"),
      fontWeight: 400,
    },
    {
      src: path.join(fontsDir, "montserrat-v31-latin-700.ttf"),
      fontWeight: 700,
    },
  ],
});

const ACCENT = "#B8960C";
const MUTED = "#5b5b5b"; // Muted gray for descriptions
const PRIMARY = "#000000"; // Black for headers and titles
const SECONDARY = "#222222"; // Slightly softer black for subheaders
const DIVIDER = "#d1d0cc"; // Light gray for lines

const styles = StyleSheet.create({
  page: {
    flexDirection: "row",
    fontFamily: "Montserrat",
    fontSize: 9,
    color: PRIMARY,
    backgroundColor: "#f0ede9", // Cream background
  },
  leftCol: {
    width: "40%",
    paddingTop: 55,
    paddingLeft: 40,
    paddingRight: 20,
    paddingBottom: 40,
    borderRight: "0.5pt solid " + DIVIDER,
  },
  rightCol: {
    width: "60%",
    paddingTop: 55,
    paddingLeft: 35,
    paddingRight: 40,
    paddingBottom: 40,
  },
  name: {
    fontSize: 26,
    fontFamily: "Montserrat",
    fontWeight: "bold",
    color: PRIMARY,
    marginBottom: 10,
    letterSpacing: -0.5,
  },
  jobTitleText: {
    fontSize: 10,
    fontFamily: "Montserrat",
    fontWeight: "bold",
    color: PRIMARY,
    letterSpacing: 2,
    textTransform: "uppercase",
    marginBottom: 45,
  },
  sectionLabel: {
    fontSize: 10,
    fontFamily: "Montserrat",
    fontWeight: "bold",
    letterSpacing: 2,
    color: PRIMARY,
    textTransform: "uppercase",
    marginBottom: 14,
    marginTop: 20,
  },
  sectionDivider: {
    borderBottom: "0.5pt solid " + DIVIDER,
    marginBottom: 10,
  },
  expBlock: {
    marginBottom: 20,
  },
  linkedinNote: {
    fontSize: 8,
    color: MUTED,
    marginTop: 2,
  },
  linkedinLink: {
    color: ACCENT,
    textDecoration: "underline",
  },
  expCompany: {
    fontSize: 10,
    fontFamily: "Montserrat",
    fontWeight: "bold",
    color: PRIMARY,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  expHeaderWrapper: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 15,
  },
  expJobTitle: {
    fontSize: 10,
    fontFamily: "Montserrat",
    fontWeight: "bold",
    color: PRIMARY,
    flex: 1,
  },
  expPeriod: {
    fontSize: 10,
    fontFamily: "Montserrat",
    fontWeight: "bold",
    color: PRIMARY,
  },
  expSeparator: {
    marginHorizontal: 5,
    fontSize: 10,
    fontFamily: "Montserrat",
    fontWeight: "bold",
    color: PRIMARY,
  },
  expDescription: {
    fontSize: 9,
    lineHeight: 1.6,
    color: MUTED,
    marginBottom: 6,
    textAlign: "justify",
  },
  itemBullet: {
    fontSize: 8,
    color: MUTED,
    marginRight: 4,
  },
  eduBlock: {
    marginBottom: 18,
  },
  eduPeriod: {
    fontSize: 9,
    fontFamily: "Montserrat",
    fontWeight: "bold",
    color: PRIMARY,
    marginBottom: 2,
  },
  eduInstitution: {
    fontSize: 10,
    fontFamily: "Montserrat",
    fontWeight: "bold",
    color: PRIMARY,
    marginBottom: 2,
  },
  eduDegree: {
    fontSize: 9,
    color: MUTED,
  },
  contactItem: {
    fontSize: 9,
    color: SECONDARY,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
  },
  skillItem: {
    fontSize: 9,
    fontFamily: "Montserrat",
    color: MUTED,
    marginBottom: 5,
    paddingLeft: 10,
    lineHeight: 1.4,
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
  linkedinUrl?: string;
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
  linkedinUrl,
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
        {/* SIDEBAR (LEFT) */}
        <View style={styles.leftCol}>
          <Text style={styles.name}>{name}</Text>
          {jobTitle && <Text style={styles.jobTitleText}>{jobTitle}</Text>}

          {/* Contact */}
          <View style={{ marginBottom: 30 }}>
            {contactItems.map((c, i) => (
              <Text key={i} style={styles.contactItem}>
                {c}
              </Text>
            ))}
          </View>

          {/* Education */}
          {education.length > 0 && (
            <View style={{ marginBottom: 20 }}>
              <View style={styles.sectionDivider} />
              <Text style={styles.sectionLabel}>EDUCATION</Text>
              {education.map((e, i) => (
                <View key={i} style={styles.eduBlock}>
                  <Text style={styles.eduPeriod}>{e.period}</Text>
                  <Text style={styles.eduInstitution}>{e.institution}</Text>
                  <Text style={styles.eduDegree}>{e.degree}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Skills */}
          {renderedCategories.length > 0 && (
            <View>
              <View style={styles.sectionDivider} />
              {renderedCategories.map((cat, i) => (
                <View key={i} style={{ marginBottom: 15 }}>
                  <Text style={styles.sectionLabel}>{cat.label}</Text>
                  {cat.items.map((item, j) => (
                    <Text key={j} style={styles.skillItem}>
                      • {item}
                    </Text>
                  ))}
                </View>
              ))}
            </View>
          )}
        </View>

        {/* MAIN (RIGHT) */}
        <View style={styles.rightCol}>
          {/* Experience — grouped by job */}
          {(grouped.length > 0 || ungrouped.length > 0) && (
            <>
              <Text style={styles.sectionLabel}>EXPERIENCE</Text>

              {grouped.map((job, i) => (
                <View key={i}>
                  {i > 0 && <View style={styles.sectionDivider} />}
                  <View style={styles.expBlock}>
                    <Text style={styles.expCompany}>{job.company}</Text>
                    <View style={styles.expHeaderWrapper}>
                      <Text style={styles.expJobTitle}>{job.jobTitle}</Text>
                      <Text style={styles.expSeparator}>|</Text>
                      <Text style={styles.expPeriod}>{job.period}</Text>
                    </View>
                    {job.descriptions.map((desc, j) => (
                      <Text key={j} style={styles.expDescription}>
                        {desc}
                      </Text>
                    ))}
                  </View>
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

              {/* LinkedIn footer */}
              {linkedinUrl && (
                <View>
                  <View style={styles.sectionDivider} />
                  <Text style={styles.linkedinNote}>
                    See full experience on{" "}
                    <Link style={styles.linkedinLink} src={linkedinUrl}>
                      LinkedIn
                    </Link>
                  </Text>
                </View>
              )}
            </>
          )}
        </View>
      </Page>
    </Document>
  );
}
