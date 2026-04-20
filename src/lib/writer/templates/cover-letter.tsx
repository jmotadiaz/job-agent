import React from 'react';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';

const ACCENT = '#B8960C';
const MUTED = '#888888';
const DARK = '#1a1a1a';

const styles = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 10,
    color: DARK,
    backgroundColor: '#ffffff',
    paddingTop: 48,
    paddingBottom: 48,
    paddingLeft: 56,
    paddingRight: 56,
  },
  header: {
    marginBottom: 32,
  },
  name: {
    fontSize: 22,
    fontFamily: 'Helvetica-Bold',
    color: DARK,
    marginBottom: 3,
  },
  jobTitleText: {
    fontSize: 11,
    color: '#444444',
    marginBottom: 2,
  },
  contactItem: {
    fontSize: 9,
    color: MUTED,
    marginBottom: 3,
  },
  date: {
    fontSize: 9,
    color: MUTED,
    marginBottom: 20,
  },
  subject: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    color: ACCENT,
    marginBottom: 16,
  },
  salutation: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 14,
  },
  paragraph: {
    fontSize: 10,
    lineHeight: 1.6,
    marginBottom: 12,
    color: '#333333',
  },
  closing: {
    fontSize: 10,
    marginTop: 20,
    marginBottom: 6,
  },
  signature: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
  },
  divider: {
    borderBottom: '0.5pt solid #dddddd',
    marginBottom: 24,
  },
});

export interface CoverLetterTemplateProps {
  senderName: string;
  senderEmail?: string;
  senderPhone?: string;
  companyName?: string;
  jobTitle?: string;
  paragraphs: string[];
  date?: string;
}

export function CoverLetterTemplate({
  senderName,
  senderEmail,
  senderPhone,
  companyName,
  jobTitle,
  paragraphs,
  date,
}: CoverLetterTemplateProps) {
  const contacts = [senderEmail, senderPhone].filter(Boolean) as string[];
  const salutation = companyName ? `Dear ${companyName} Hiring Team,` : 'Dear Hiring Team,';
  const subject = jobTitle ? `Re: ${jobTitle}` : undefined;
  const dateStr = date ?? new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.name}>{senderName}</Text>
          {jobTitle && <Text style={styles.jobTitleText}>{jobTitle}</Text>}
          {contacts.map((c, i) => (
            <Text key={i} style={styles.contactItem}>{c}</Text>
          ))}
        </View>

        <View style={styles.divider} />

        <Text style={styles.date}>{dateStr}</Text>

        {subject && <Text style={styles.subject}>{subject}</Text>}

        <Text style={styles.salutation}>{salutation}</Text>

        {paragraphs.map((p, i) => (
          <Text key={i} style={styles.paragraph}>{p}</Text>
        ))}

        <Text style={styles.closing}>Yours sincerely,</Text>
        <Text style={styles.signature}>{senderName}</Text>
      </Page>
    </Document>
  );
}
