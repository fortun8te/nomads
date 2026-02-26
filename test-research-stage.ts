/**
 * Test Research Stage
 *
 * This script simulates what happens when a user submits campaign data
 * through the CampaignSelector form and the Research stage executes.
 *
 * Flow:
 * 1. Load sample campaign data
 * 2. Create research prompt from brand + audience + goal
 * 3. Stream response from remote Ollama via Cloudflare tunnel
 * 4. Display output in real-time
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load sample data
const sampleDataPath = path.join(__dirname, 'sample-campaign-data.json');
const sampleData = JSON.parse(fs.readFileSync(sampleDataPath, 'utf-8'));

const OLLAMA_HOST = 'https://regulatory-really-victorian-clips.trycloudflare.com';
const OLLAMA_API = `${OLLAMA_HOST}/api/generate`;

// System prompt for Research stage
const RESEARCH_SYSTEM_PROMPT = `You are an expert marketing researcher. Your task is to research effective advertising strategies, target audience insights, and market trends for brands.

When given a brand name, target audience, and marketing goal, provide:
1. Target audience profile and psychographics
2. Current market trends relevant to the brand
3. Competitor analysis insights
4. Effective messaging angles
5. Key pain points the audience experiences
6. Recommended advertising channels and formats
7. Potential objections to address

Be concise but informative. Format your response in clear sections with headers.`;

// Build the research prompt from sample data
function buildResearchPrompt(): string {
  const { campaign, brandData, personaData, productData } = sampleData;

  return `BRAND INFORMATION:
Name: ${campaign.brand}
Website: ${brandData.website}
Industry: ${brandData.industry}
Positioning: ${brandData.positioning}
Brand Why: ${brandData.brandWhy}

TARGET AUDIENCE:
Name/Persona: ${personaData.name}
Age: ${personaData.age}
Job: ${personaData.job}
Location: ${personaData.location}
Income: ${personaData.income}
Key Pain Points: ${personaData.painPoints.join(', ')}
Core Values: ${personaData.values.join(', ')}

PRODUCT:
Name: ${productData.productName}
Category: ${productData.productCategory}
Problem Solved: ${productData.problemSolved}
Key Benefits: ${productData.functionalBenefits.join(', ')}
Price: ${productData.pricing}

MARKETING GOAL:
${campaign.marketingGoal}

Task: Analyze this brand, audience, and product. Provide research insights that would guide an advertising strategy.`;
}

// Stream from Ollama with real-time output
async function streamResearch(): Promise<string> {
  console.log('🔍 RESEARCH STAGE INITIALIZED');
  console.log('═'.repeat(80));
  console.log(`📍 Ollama Host: ${OLLAMA_HOST}`);
  console.log(`🎯 Campaign: ${sampleData.campaign.brand}`);
  console.log(`👤 Persona: ${sampleData.personaData.name}`);
  console.log('═'.repeat(80));
  console.log('\n⏳ Connecting to Ollama and generating research...\n');

  const prompt = buildResearchPrompt();
  let fullResponse = '';

  try {
    const response = await fetch(OLLAMA_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'qwen3:8b',
        prompt: `${RESEARCH_SYSTEM_PROMPT}\n\n${prompt}`,
        stream: true,
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.statusText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');

    const decoder = new TextDecoder();
    let buffer = '';
    let chunkCount = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.trim()) {
          try {
            const json = JSON.parse(line);
            if (json.response) {
              fullResponse += json.response;
              process.stdout.write(json.response);
              chunkCount++;
            }
          } catch {
            // Ignore JSON parse errors
          }
        }
      }
    }

    // Process remaining buffer
    if (buffer.trim()) {
      try {
        const json = JSON.parse(buffer);
        if (json.response) {
          fullResponse += json.response;
          process.stdout.write(json.response);
        }
      } catch {
        // Ignore
      }
    }

    console.log('\n\n═'.repeat(80));
    console.log('✅ RESEARCH STAGE COMPLETE');
    console.log(`📊 Streamed ${chunkCount} chunks`);
    console.log(`📝 Total tokens generated: ~${Math.ceil(fullResponse.length / 4)}`);
    console.log('═'.repeat(80));

    return fullResponse;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error('\n❌ ERROR:', err.message);
    console.error('\nTroubleshooting:');
    console.error('1. Is Ollama running? (ollama serve)');
    console.error('2. Is the Cloudflare tunnel active?');
    console.error('3. Check: curl ' + OLLAMA_HOST + '/api/tags');
    throw err;
  }
}

// Main execution
async function main() {
  try {
    const researchOutput = await streamResearch();

    // Save output to file for reference
    const outputPath = path.join(__dirname, 'research-output.txt');
    fs.writeFileSync(outputPath, researchOutput);
    console.log(`\n💾 Output saved to: ${outputPath}`);

    // Also save as JSON for pipeline usage
    const jsonOutput = {
      timestamp: new Date().toISOString(),
      campaign: sampleData.campaign.brand,
      stage: 'research',
      output: researchOutput,
      tokensUsed: Math.ceil(researchOutput.length / 4),
    };
    const jsonPath = path.join(__dirname, 'research-output.json');
    fs.writeFileSync(jsonPath, JSON.stringify(jsonOutput, null, 2));
    console.log(`📄 JSON output saved to: ${jsonPath}`);
  } catch (error) {
    process.exit(1);
  }
}

main();
