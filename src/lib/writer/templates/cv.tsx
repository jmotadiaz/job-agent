import React from 'react';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';

const styles = StyleSheet.create({
  page: { padding: 40, fontFamily: 'Helvetica', fontSize: 10, color: '#222' },
  header: { marginBottom: 16 },
  name: { fontSize: 22, fontFamily: 'Helvetica-Bold', marginBottom: 4 },
  contactLine: { fontSize: 9, color: '#555', marginBottom: 2 },
  sectionTitle: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    textTransform: 'uppercase',
    letterSpacing: 1,
    borderBottom: '1pt solid #ccc',
    paddingBottom: 2,
    marginTop: 14,
    marginBottom: 6,
  },
  summary: { fontSize: 10, lineHeight: 1.5, marginBottom: 4 },
  experienceBlock: { marginBottom: 8 },
  jobTitle: { fontFamily: 'Helvetica-Bold', fontSize: 10 },
  jobMeta: { fontSize: 9, color: '#555', marginBottom: 2 },
  bullet: { fontSize: 10, marginLeft: 10, marginBottom: 2, lineHeight: 1.4 },
  skillsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  skillChip: {
    fontSize: 9,
    backgroundColor: '#f0f0f0',
    padding: '2pt 6pt',
    borderRadius: 3,
    marginRight: 4,
    marginBottom: 4,
  },
  educationBlock: { marginBottom: 6 },
  eduTitle: { fontFamily: 'Helvetica-Bold', fontSize: 10 },
  eduMeta: { fontSize: 9, color: '#555' },
});

export interface BulletItem {
  bulletId: string;
  renderedText: string;
}

export interface CvTemplateProps {
  name: string;
  email?: string;
  phone?: string;
  location?: string;
  linkedin?: string;
  website?: string;
  summary?: string;
  bullets: BulletItem[];
  skills?: string[];
  education?: Array<{ institution: string; degree: string; period: string }>;
  jobTitle?: string;
}

export function CvTemplate({
  name,
  email,
  phone,
  location,
  linkedin,
  website,
  summary,
  bullets,
  skills = [],
  education = [],
  jobTitle,
}: CvTemplateProps) {
  const contacts = [email, phone, location, linkedin, website].filter(Boolean);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.name}>{name}</Text>
          {jobTitle && <Text style={{ ...styles.contactLine, fontFamily: 'Helvetica-Bold' }}>{jobTitle}</Text>}
          <Text style={styles.contactLine}>{contacts.join('  ·  ')}</Text>
        </View>

        {/* Summary */}
        {summary && (
          <>
            <Text style={styles.sectionTitle}>Summary</Text>
            <Text style={styles.summary}>{summary}</Text>
          </>
        )}

        {/* Experience */}
        {bullets.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Experience</Text>
            <View style={styles.experienceBlock}>
              {bullets.map((b, i) => (
                <Text key={b.bulletId ?? i} style={styles.bullet}>• {b.renderedText}</Text>
              ))}
            </View>
          </>
        )}

        {/* Skills */}
        {skills.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Skills</Text>
            <View style={styles.skillsRow}>
              {skills.map((s, i) => (
                <Text key={i} style={styles.skillChip}>{s}</Text>
              ))}
            </View>
          </>
        )}

        {/* Education */}
        {education.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Education</Text>
            {education.map((e, i) => (
              <View key={i} style={styles.educationBlock}>
                <Text style={styles.eduTitle}>{e.institution}</Text>
                <Text style={styles.eduMeta}>{e.degree}  ·  {e.period}</Text>
              </View>
            ))}
          </>
        )}
      </Page>
    </Document>
  );
}
