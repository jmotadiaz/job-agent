import React from 'react';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';

const styles = StyleSheet.create({
  page: { padding: 60, fontFamily: 'Helvetica', fontSize: 11, color: '#222', lineHeight: 1.6 },
  header: { marginBottom: 24 },
  senderName: { fontSize: 14, fontFamily: 'Helvetica-Bold', marginBottom: 2 },
  senderContact: { fontSize: 9, color: '#555' },
  date: { fontSize: 10, color: '#555', marginBottom: 16, marginTop: 16 },
  salutation: { marginBottom: 12, fontFamily: 'Helvetica-Bold' },
  paragraph: { marginBottom: 10, fontSize: 11, lineHeight: 1.6 },
  closing: { marginTop: 20, marginBottom: 4 },
  signature: { fontFamily: 'Helvetica-Bold' },
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
  const contacts = [senderEmail, senderPhone].filter(Boolean);
  const salutation = companyName ? `Dear ${companyName} Hiring Team,` : 'Dear Hiring Team,';
  const subject = jobTitle ? `Re: ${jobTitle}` : undefined;
  const dateStr = date ?? new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.senderName}>{senderName}</Text>
          {contacts.length > 0 && (
            <Text style={styles.senderContact}>{contacts.join('  ·  ')}</Text>
          )}
        </View>

        <Text style={styles.date}>{dateStr}</Text>

        {subject && <Text style={{ ...styles.paragraph, fontFamily: 'Helvetica-Bold', marginBottom: 12 }}>{subject}</Text>}

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
