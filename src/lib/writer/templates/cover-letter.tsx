import React from 'react';
import path from 'path';
import { Document, Page, Text, View, StyleSheet, Font } from '@react-pdf/renderer';

// Disable hyphenation to prevent splitting words
Font.registerHyphenationCallback((word) => [word]);

const fontsDir = path.join(process.cwd(), "src/lib/writer/templates/fonts");

// Register Montserrat font using local files to avoid network issues
Font.register({
  family: 'Montserrat',
  fonts: [
    { src: path.join(fontsDir, "montserrat-v31-latin-regular.ttf") },
    { src: path.join(fontsDir, "montserrat-v31-latin-700.ttf"), fontWeight: 700 },
  ],
});

const MUTED = "#555555";
const PRIMARY = "#000000";
const SECONDARY = "#333333";
const DIVIDER = "#cccbc8";

const styles = StyleSheet.create({
  page: {
    fontFamily: "Montserrat",
    fontSize: 10,
    color: PRIMARY,
    backgroundColor: "#f0ede9",
    paddingTop: 60,
    paddingBottom: 60,
    paddingLeft: 50,
    paddingRight: 50,
  },
  header: {
    marginBottom: 0,
  },
  name: {
    fontSize: 32,
    fontFamily: "Montserrat",
    fontWeight: "bold",
    color: PRIMARY,
    marginBottom: 8,
  },
  jobTitleText: {
    fontSize: 12,
    fontFamily: "Montserrat",
    fontWeight: "bold",
    color: PRIMARY,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    marginBottom: 40,
  },
  divider: {
    borderBottom: "0.5pt solid " + DIVIDER,
    marginBottom: 40,
  },
  date: {
    fontSize: 9,
    fontFamily: "Montserrat",
    fontWeight: "bold",
    color: PRIMARY,
    marginBottom: 30,
  },
  salutation: {
    fontSize: 10,
    fontFamily: "Montserrat",
    marginBottom: 15,
    color: PRIMARY,
  },
  paragraph: {
    fontSize: 10,
    lineHeight: 1.6,
    marginBottom: 15,
    color: MUTED,
    textAlign: "justify",
  },
  closing: {
    fontSize: 10,
    marginTop: 20,
    marginBottom: 4,
    color: PRIMARY,
  },
  signature: {
    fontSize: 10,
    fontFamily: "Montserrat",
    fontWeight: "bold",
    color: PRIMARY,
  },
  footer: {
    position: "absolute",
    bottom: 50,
    left: 50,
    right: 50,
  },
  contactItem: {
    fontSize: 9,
    color: MUTED,
    marginBottom: 4,
  },
  thanks: {
    fontSize: 10,
    fontFamily: "Montserrat",
    fontWeight: "bold",
    marginTop: 10,
    color: PRIMARY,
  }
});

export interface CoverLetterTemplateProps {
  senderName: string;
  senderEmail?: string;
  senderPhone?: string;
  senderLinkedin?: string;
  companyName?: string;
  jobTitle?: string;
  paragraphs: string[];
  date?: string;
}

export function CoverLetterTemplate({
  senderName,
  senderEmail,
  senderPhone,
  senderLinkedin,
  companyName,
  jobTitle,
  paragraphs,
  date,
}: CoverLetterTemplateProps) {
  const contacts = [senderEmail, senderPhone, senderLinkedin].filter(Boolean) as string[];
  const salutation = companyName ? `Dear ${companyName} Hiring Team,` : 'Dear Hiring Team,';
  const dateStr = date ?? new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.name}>{senderName}</Text>
          {jobTitle && <Text style={styles.jobTitleText}>{jobTitle}</Text>}
        </View>

        <View style={styles.divider} />

        <View style={{ flex: 1 }}>
          <Text style={styles.date}>{dateStr}</Text>

          <Text style={styles.salutation}>{salutation}</Text>

          {paragraphs.map((p, i) => (
            <Text key={i} style={styles.paragraph}>{p}</Text>
          ))}

          <View style={{ marginTop: 25 }}>
            <Text style={styles.closing}>Warm regards,</Text>
            <Text style={styles.signature}>{senderName}</Text>
          </View>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          {contacts.map((c, i) => (
            <Text key={i} style={styles.contactItem}>{c}</Text>
          ))}
          <Text style={styles.thanks}>Thanks again for your time.</Text>
        </View>
      </Page>
    </Document>
  );
}
