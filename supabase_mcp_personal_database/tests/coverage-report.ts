#!/usr/bin/env node

import fs from 'fs';
import path from 'path';

interface CoverageData {
  total: {
    statements: { pct: number };
    branches: { pct: number };
    functions: { pct: number };
    lines: { pct: number };
  };
}

async function generateCoverageReport() {
  const coverageDir = 'coverage';
  const summaryFile = path.join(coverageDir, 'coverage-summary.json');
  
  if (!fs.existsSync(summaryFile)) {
    console.log('❌ Coverage summary file not found. Run tests with coverage first.');
    process.exit(1);
  }

  const coverageData: CoverageData = JSON.parse(fs.readFileSync(summaryFile, 'utf8'));
  const { total } = coverageData;

  console.log('\n📊 Test Coverage Report');
  console.log('========================');
  
  const formatPercent = (pct: number) => {
    const emoji = pct >= 90 ? '🟢' : pct >= 80 ? '🟡' : '🔴';
    return `${emoji} ${pct.toFixed(2)}%`;
  };

  console.log(`Statements: ${formatPercent(total.statements.pct)}`);
  console.log(`Branches:   ${formatPercent(total.branches.pct)}`);
  console.log(`Functions:  ${formatPercent(total.functions.pct)}`);
  console.log(`Lines:      ${formatPercent(total.lines.pct)}`);

  const overallScore = (
    total.statements.pct + 
    total.branches.pct + 
    total.functions.pct + 
    total.lines.pct
  ) / 4;

  console.log(`\n📈 Overall Coverage: ${formatPercent(overallScore)}`);

  if (overallScore >= 90) {
    console.log('🎉 Excellent test coverage!');
  } else if (overallScore >= 80) {
    console.log('✅ Good test coverage.');
  } else if (overallScore >= 70) {
    console.log('⚠️  Moderate test coverage. Consider adding more tests.');
  } else {
    console.log('🚨 Low test coverage. More tests needed!');
  }

  // Check if HTML report exists
  const htmlReport = path.join(coverageDir, 'lcov-report', 'index.html');
  if (fs.existsSync(htmlReport)) {
    console.log(`\n📄 Detailed HTML report: file://${path.resolve(htmlReport)}`);
  }

  // Exit with error code if coverage is below threshold
  const threshold = 80;
  if (overallScore < threshold) {
    console.log(`\n❌ Coverage ${overallScore.toFixed(2)}% is below threshold ${threshold}%`);
    process.exit(1);
  }

  console.log('\n✅ Coverage meets threshold requirements\n');
}

generateCoverageReport().catch(console.error);