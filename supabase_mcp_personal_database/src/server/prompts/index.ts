import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { GetPromptRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { supabaseAdmin } from '../../database/client.js';

export function setupPersonalDataPrompts(server: Server): void {
  server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      switch (name) {
        case 'analyze_personal_data':
          return await handleAnalyzePersonalDataPrompt(args || {});

        case 'privacy_assessment':
          return await handlePrivacyAssessmentPrompt(args || {});

        case 'data_migration':
          return await handleDataMigrationPrompt(args || {});

        default:
          throw new Error(`Unknown prompt: ${name}`);
      }
    } catch (error) {
      return {
        messages: [
          {
            role: 'assistant' as const,
            content: {
              type: 'text',
              text: `Error generating prompt: ${error instanceof Error ? error.message : 'Unknown error'}`,
            },
          },
        ],
      };
    }
  });
}

async function handleAnalyzePersonalDataPrompt(args: Record<string, unknown>) {
  const { user_id, analysis_type } = args;

  if (!user_id || !analysis_type) {
    throw new Error('Missing required arguments: user_id and analysis_type');
  }

  // Get user's personal data for context
  const { data: personalData, error } = await supabaseAdmin
    .from('personal_data')
    .select('data_type, classification, tags, created_at')
    .eq('user_id', user_id as string)
    .is('deleted_at', null);

  if (error) throw new Error(`Database error: ${error.message}`);

  const dataStats = (personalData || []).reduce((acc, record) => {
    acc.types[record.data_type] = (acc.types[record.data_type] || 0) + 1;
    acc.classifications[record.classification] = (acc.classifications[record.classification] || 0) + 1;
    acc.total++;
    return acc;
  }, { types: {} as Record<string, number>, classifications: {} as Record<string, number>, total: 0 });

  let promptText = '';

  switch (analysis_type) {
    case 'privacy_overview':
      promptText = `# Personal Data Privacy Analysis

Please analyze the following personal data inventory for privacy risks and compliance:

## Data Inventory Summary
- Total Records: ${dataStats.total}
- Data Types: ${JSON.stringify(dataStats.types, null, 2)}
- Classification Distribution: ${JSON.stringify(dataStats.classifications, null, 2)}

## Analysis Instructions
1. **Privacy Risk Assessment**: Identify potential privacy risks based on data types and classifications
2. **GDPR Compliance**: Assess compliance with GDPR requirements (lawful basis, data minimization, etc.)
3. **Data Classification Review**: Evaluate if data is properly classified according to sensitivity levels
4. **Recommendations**: Provide specific recommendations for improving privacy posture

## Focus Areas
- Look for over-collection of personal data
- Identify sensitive data that may need additional protection
- Assess data retention needs
- Review consent and lawful basis requirements

Please provide a comprehensive privacy analysis with actionable recommendations.`;
      break;

    case 'data_quality':
      promptText = `# Personal Data Quality Analysis

Please analyze the following personal data for quality issues and improvement opportunities:

## Data Inventory Summary
- Total Records: ${dataStats.total}
- Data Types: ${JSON.stringify(dataStats.types, null, 2)}
- Classification Distribution: ${JSON.stringify(dataStats.classifications, null, 2)}

## Quality Analysis Instructions
1. **Data Completeness**: Assess if required fields are populated
2. **Data Accuracy**: Look for potential data quality issues
3. **Data Consistency**: Check for inconsistent formats or values
4. **Data Freshness**: Evaluate how current the data appears to be
5. **Schema Compliance**: Verify data conforms to expected schemas

## Quality Metrics to Consider
- Missing required fields
- Inconsistent data formats
- Duplicate records
- Outdated information
- Invalid values

Please provide a detailed data quality assessment with specific improvement recommendations.`;
      break;

    case 'usage_patterns':
      promptText = `# Personal Data Usage Pattern Analysis

Please analyze the following personal data to identify usage patterns and optimization opportunities:

## Data Inventory Summary
- Total Records: ${dataStats.total}
- Data Types: ${JSON.stringify(dataStats.types, null, 2)}
- Classification Distribution: ${JSON.stringify(dataStats.classifications, null, 2)}

## Usage Analysis Instructions
1. **Access Patterns**: Identify which data types are accessed most frequently
2. **Data Relationships**: Look for connections between different data types
3. **User Behavior**: Analyze patterns in how users organize and categorize their data
4. **Optimization Opportunities**: Suggest ways to improve data organization and access

## Pattern Analysis Areas
- Most/least used data types
- Common tag usage patterns
- Classification trends
- Data creation patterns over time

Please provide insights into usage patterns with recommendations for better data organization.`;
      break;

    default:
      promptText = `# General Personal Data Analysis

Please analyze the following personal data:

## Data Summary
- Total Records: ${dataStats.total}
- Data Types: ${JSON.stringify(dataStats.types, null, 2)}
- Classification Distribution: ${JSON.stringify(dataStats.classifications, null, 2)}

Please provide a comprehensive analysis based on the data provided.`;
  }

  return {
    messages: [
      {
        role: 'user' as const,
        content: {
          type: 'text',
          text: promptText,
        },
      },
    ],
  };
}

async function handlePrivacyAssessmentPrompt(args: Record<string, unknown>) {
  const { data_changes } = args;

  if (!data_changes) {
    throw new Error('Missing required argument: data_changes');
  }

  const promptText = `# Privacy Impact Assessment

Please conduct a privacy impact assessment for the following data changes:

## Proposed Changes
\`\`\`json
${JSON.stringify(data_changes, null, 2)}
\`\`\`

## Assessment Framework
Please evaluate the changes using the following criteria:

### 1. Data Protection Impact
- **Purpose**: What is the intended purpose of these changes?
- **Lawful Basis**: What lawful basis applies under GDPR?
- **Data Minimization**: Are only necessary data elements being processed?
- **Proportionality**: Are the changes proportionate to the intended purpose?

### 2. Risk Assessment
- **Privacy Risks**: What privacy risks do these changes introduce?
- **Security Implications**: How do these changes affect data security?
- **Individual Rights**: How might these changes impact data subject rights?
- **Compliance Risks**: What compliance risks need to be addressed?

### 3. Mitigation Measures
- **Technical Safeguards**: What technical measures should be implemented?
- **Organizational Measures**: What process changes are needed?
- **Monitoring**: How should these changes be monitored for compliance?

### 4. Recommendations
- **Immediate Actions**: What should be done before implementing changes?
- **Ongoing Monitoring**: What ongoing monitoring is required?
- **Documentation**: What documentation needs to be updated?

## Output Format
Please provide:
1. Overall risk level (LOW/MEDIUM/HIGH)
2. Key privacy concerns identified
3. Specific mitigation recommendations
4. Compliance checklist for implementation

Please provide a thorough privacy impact assessment with actionable recommendations.`;

  return {
    messages: [
      {
        role: 'user' as const,
        content: {
          type: 'text',
          text: promptText,
        },
      },
    ],
  };
}

async function handleDataMigrationPrompt(args: Record<string, unknown>) {
  const { source_format, target_format } = args;

  if (!source_format || !target_format) {
    throw new Error('Missing required arguments: source_format and target_format');
  }

  const promptText = `# Data Migration Planning Guide

Please help plan a data migration from **${source_format}** to **${target_format}** format.

## Migration Context
- **Source Format**: ${source_format}
- **Target Format**: ${target_format}
- **Data Type**: Personal data with privacy requirements

## Migration Planning Areas

### 1. Data Mapping
- **Schema Mapping**: How should data fields be mapped between formats?
- **Data Type Conversion**: What data type conversions are needed?
- **Field Validation**: What validation rules should be applied?
- **Default Values**: How should missing or null values be handled?

### 2. Privacy Considerations
- **Data Classification**: How should data classification be preserved?
- **Encryption**: What encryption considerations apply during migration?
- **Access Controls**: How should access controls be maintained?
- **Audit Trail**: What audit logging is needed for the migration?

### 3. Data Quality
- **Validation Rules**: What validation should be performed on migrated data?
- **Duplicate Detection**: How should duplicates be identified and handled?
- **Data Cleansing**: What data cleansing may be needed?
- **Quality Metrics**: How should migration quality be measured?

### 4. Migration Process
- **Batch Size**: What batch size is optimal for this migration?
- **Error Handling**: How should migration errors be handled?
- **Rollback Plan**: What rollback procedures are needed?
- **Testing Strategy**: How should the migration be tested?

### 5. Compliance & Security
- **GDPR Compliance**: How to maintain GDPR compliance during migration?
- **Data Retention**: How are retention policies affected?
- **Security Measures**: What security measures are needed during migration?
- **Documentation**: What documentation needs to be updated?

## Deliverables Requested
1. **Migration Plan**: Step-by-step migration process
2. **Risk Assessment**: Potential risks and mitigation strategies
3. **Testing Strategy**: How to validate migration success
4. **Compliance Checklist**: Ensuring regulatory compliance
5. **Rollback Procedures**: How to reverse migration if needed

Please provide a comprehensive migration plan with specific recommendations for this data format conversion.`;

  return {
    messages: [
      {
        role: 'user' as const,
        content: {
          type: 'text',
          text: promptText,
        },
      },
    ],
  };
}