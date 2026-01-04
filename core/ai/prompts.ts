// AI Prompts for Klore template operations

export const SYSTEM_PROMPT = `You are Klore AI, a strict JSON-only template analysis expert.
You help create reusable project templates by detecting BRAND-SPECIFIC content only.
Rules:
1. ONLY respond with valid JSON.
2. NO conversational text, NO explanations, NO markdown blocks.
3. Start your response directly with { or [.
4. Be SELECTIVE - only extract content that is UNIQUE to this brand/company.
5. NEVER extract generic UI text like navigation labels, button text, form labels.`;

export const ANALYZE_PROJECT_PROMPT = `Analyze this project structure and determine its type and characteristics.

Files:
{files}

Sample Content:
{sampleContent}

Respond with JSON:
{
  "projectType": "ecommerce|company_profile|saas|blog|portfolio|landing_page|admin_panel|other",
  "industry": "fashion|food|education|tech|retail|services|other",
  "framework": "laravel|nextjs|vue|react|static|other",
  "description": "Brief description of what this project is",
  "brandName": "Detected brand/company name if found",
  "suggestedGroups": ["branding", "contact", "social", "legal"]
}`;

export const EXTRACT_REPLACEABLE_PROMPT = `Analyze the file content provided below to identify specific content that should be configurable in a template. 

Your goal is to extract:
1. Brand Identity (Names, Colors, Taglines)
2. Contact Info (Emails, Phones, Addresses)
3. **Marketing Content** (Hero titles, About descriptions, Feature lists, Calls to Action)
4. Legal/Institution Info

### STRICT GUIDELINES:

1. **Context Awareness**: Look for HTML comments (e.g., <!-- Hero Section -->), class names (class="hero", id="about"), or nearby tags to identify the content's purpose.
2. **Handle Multi-line**: If text spans multiple lines in the source (e.g., separated by <br>, tags, or newlines), capture the EXACT raw string needed to replace it.
3. **Ignore Generic UI**: Do NOT extract navigation labels ("Home", "Login"), button labels ("Submit"), or form labels ("Email"). ONLY extract content that conveys a *message* or *brand identity*.
4. **Distinguish Content**: "Welcome to our store" is generic. "Welcome to Skanilan Store" is brand-specific. "Best Quality" is generic. "Quality & Creativity in Every Stitch" is marketing copy -> EXTRACT IT.

### RESPONSE FORMAT (JSON ONLY):

Return a JSON object with a "items" array:

{
  "items": [
    {
      "value": "Exact raw text content found in file",
      "suggestedName": "semanticVariableName (camelCase)",
      "type": "text|color|email|phone|url|rich_text",
      "group": "branding|hero|about|features|contact|footer|legal",
      "description": "Short description for the prompt (e.g. 'Hero section main title')",
      "confidence": "high|medium",
      "required": true
    }
  ]
}

### EXAMPLES:

Input:
\`\`\`html
<!-- Hero -->
<h1>Fashion Modern<br>Untuk Anda</h1>
<p>Temukan gaya terbaikmu disini.</p>
\`\`\`

Output:
{
  "items": [
    { "value": "Fashion Modern<br>Untuk Anda", "suggestedName": "heroTitle", "type": "rich_text", "group": "hero", "description": "Main title on homepage hero", "confidence": "high", "required": true },
    { "value": "Temukan gaya terbaikmu disini.", "suggestedName": "heroSubtitle", "type": "text", "group": "hero", "description": "Subtitle on homepage hero", "confidence": "high", "required": true }
  ]
}

Input:
\`\`\`html
<button>Submit</button>
<a href="/login">Login</a>
\`\`\`

Output:
{ "items": [] }

=== TARGET FILE ===
File: {filename}
Content:
\`\`\`
{content}
\`\`\`
`;

export const TEMPLATIZE_PROMPT = `Analyze this project file content and identify ALL replaceable content that should become template variables.

For each piece of replaceable content, provide:
- type: one of "app_name", "email", "phone", "url", "color", "tagline", "address", "social_url"
- value: the exact text to replace
- suggestedName: a semantic camelCase variable name
- required: boolean indicating if this is essential (app_name, primary contact email)
- group: semantic group like "branding", "contact", "social", "legal"

File: {filename}
Content:
\`\`\`
{content}
\`\`\`

Respond with a JSON array of detected items:
[
  {
    "type": "app_name",
    "value": "MyStore",
    "suggestedName": "appName",
    "required": true,
    "group": "branding"
  }
]

Only include actual brand-specific content, not generic code or library references.
Focus on: company names, contact info, social links, brand colors, taglines, addresses.`;

export const PARSE_BRAND_PROMPT = `Parse this brand description and extract all relevant information for a project template.

User Description:
"{description}"

Available template variables:
{variables}

Extract and map the user's description to the template variables. For any variable not explicitly mentioned, suggest a reasonable default based on the brand context.

Respond with a JSON object mapping variable names to values:
{
  "appName": "VIBES",
  "primaryColor": "#8B5CF6",
  "tagline": "Fashion for Gen-Z",
  "contactEmail": "hello@vibes.id"
}

Be creative with defaults that match the brand's style and industry.
If colors are mentioned by name (e.g., "ungu" = purple, "biru" = blue), convert to hex codes.`;

export const SUGGEST_VARIABLES_PROMPT = `Context:
Framework: {framework}
Data:
{content}

Task: Output valid JSON exactly in this structure.
NO comments, NO ellipses (...), NO conversational text.

{
  "variables": [
    { "name": "appName", "type": "STRING", "defaultValue": "{framework} App", "required": true, "group": "branding" }
  ],
  "groups": [
    { "name": "branding", "variables": ["appName"] }
  ]
}`;

// Builder functions
export function buildAnalyzeProjectPrompt(files: string[], sampleContent: string): string {
  return ANALYZE_PROJECT_PROMPT
    .replace('{files}', files.slice(0, 50).join('\n'))
    .replace('{sampleContent}', sampleContent.slice(0, 4000));
}

export function buildExtractReplaceablePrompt(projectType: string, filename: string, content: string): string {
  return EXTRACT_REPLACEABLE_PROMPT
    .replace('{projectType}', projectType)
    .replace('{filename}', filename)
    .replace('{content}', content.slice(0, 12000));
}

export function buildTemplatizePrompt(filename: string, content: string): string {
  return TEMPLATIZE_PROMPT
    .replace('{filename}', filename)
    .replace('{content}', content.slice(0, 8000));
}

export function buildBrandParsePrompt(description: string, variables: string[]): string {
  return PARSE_BRAND_PROMPT
    .replace('{description}', description)
    .replace('{variables}', variables.join(', '));
}

export function buildSuggestVariablesPrompt(
  framework: string,
  languages: string[],
  content: Array<{ type: string; value: string }>
): string {
  const contentSummary = content
    .slice(0, 30)
    .map(c => `- ${c.type}: ${c.value}`)
    .join('\n');
  
  return SUGGEST_VARIABLES_PROMPT
    .replace('{framework}', framework || 'Unknown')
    .replace('{languages}', languages.join(', '))
    .replace('{content}', contentSummary);
}
