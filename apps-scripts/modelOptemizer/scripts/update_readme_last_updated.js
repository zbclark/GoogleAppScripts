#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const readmePath = path.resolve(__dirname, '..', 'README.md');

const formatDate = (date) => {
  const formatter = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric'
  });
  return formatter.format(date);
};

const updateReadme = () => {
  if (!fs.existsSync(readmePath)) {
    console.error(`README not found at ${readmePath}`);
    process.exit(1);
  }

  const content = fs.readFileSync(readmePath, 'utf8');
  const dateText = formatDate(new Date());
  const nextLine = `*Last updated: ${dateText}*`;

  if (!content.includes('*Last updated:')) {
    console.error('No "Last updated" line found in README.');
    process.exit(1);
  }

  const updated = content.replace(/\*Last updated:[^\n]*\*/g, nextLine);
  fs.writeFileSync(readmePath, updated, 'utf8');
  console.log(`Updated README date to ${dateText}`);
};

updateReadme();
