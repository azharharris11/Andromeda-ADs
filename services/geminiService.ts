

import { GoogleGenAI, Type, Modality, GenerateContentResponse } from "@google/genai";
import { CreativeFormat, ProjectContext, AdCopy, FunnelStage, CreativeConcept, GenResult, MarketAwareness, CopyFramework } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

// --- Utils ---

const runWithRetry = async <T>(operation: () => Promise<T>, retries = 3, initialDelay = 1000): Promise<T> => {
  for (let i = 0; i < retries; i++) {
    try {
      return await operation();
    } catch (error: any) {
      // STRICTER RETRY LOGIC: Only retry on Rate Limits (429) or Server Overload (503)
      const isTransient = 
        error?.status === 429 || 
        error?.code === 429 || 
        error?.status === 503 ||
        error?.message?.includes('429') || 
        error?.message?.includes('503') ||
        error?.message?.includes('RESOURCE_EXHAUSTED');

      if (isTransient) {
        if (i === retries - 1) throw error;
        const delay = initialDelay * Math.pow(2, i) + (Math.random() * 500);
        console.warn(`Gemini API Transient Error (Attempt ${i + 1}/${retries}). Retrying...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      // If it's a 400 or generic error, throw immediately to save time/resources
      throw error;
    }
  }
  throw new Error("Max retries exceeded");
};

// Helper: Smart Visual Enhancer Merging
const getVisualEnhancers = (style: string, format: CreativeFormat): string => {
    // FORMAT RULES (The "Chassis")
    // We define the non-negotiable base texture/quality for each format group.
    
    // 1. INSTAGRAM NATIVE / APP UI
    if (
        format === CreativeFormat.STORY_POLL || 
        format === CreativeFormat.STORY_QNA || 
        format === CreativeFormat.REELS_THUMBNAIL || 
        format === CreativeFormat.DM_NOTIFICATION ||
        format === CreativeFormat.TWITTER_REPOST ||
        format === CreativeFormat.PHONE_NOTES ||
        format === CreativeFormat.GMAIL_UX ||
        format === CreativeFormat.CHAT_CONVERSATION ||
        format === CreativeFormat.SOCIAL_COMMENT_STACK // NEW
    ) {
        return "style:mobile-app-screenshot, quality:high-fidelity-ui, texture:screen-pixel, vibe:authentic-social-media, perspective:flat-2d-screen-capture";
    }

    // 2. LO-FI / RAW / REALISM
    if (
        format === CreativeFormat.UGLY_VISUAL || 
        format === CreativeFormat.REDDIT_THREAD ||
        format === CreativeFormat.POV_HANDS ||
        format === CreativeFormat.UGC_MIRROR ||
        format === CreativeFormat.US_VS_THEM ||
        format === CreativeFormat.HANDHELD_TWEET || // NEW
        format === CreativeFormat.STICKY_NOTE_REALISM || // NEW
        format === CreativeFormat.CAROUSEL_REAL_STORY // NEW (Influencer style)
    ) {
        return "texture:grainy/noise, lighting:natural-window/harsh-flash, quality:amateur/raw/authentic, device:smartphone-camera-iphone, focus:sharp-subject-blurry-background";
    }

    // 3. MEME
    if (format === CreativeFormat.MEME || format === CreativeFormat.MS_PAINT) {
        return "style:ms-paint/doodle, quality:low-res/pixelated, vibe:internet-humor";
    }

    // 4. VECTOR / UI (Minimal)
    if (
        format === CreativeFormat.CAROUSEL_EDUCATIONAL ||
        format === CreativeFormat.GRAPH_CHART ||
        format === CreativeFormat.CARTOON ||
        format === CreativeFormat.WHITEBOARD ||
        format === CreativeFormat.TIMELINE_JOURNEY ||
        format === CreativeFormat.CHECKLIST_TODO ||
        format === CreativeFormat.SEARCH_BAR ||
        format === CreativeFormat.REMINDER_NOTIF
    ) {
        return "style:flat-vector/minimal-ui, shading:none, depth:2d, color:solid-hex-codes";
    }

    // 5. HIGH END / CINEMATIC / INFO-PRODUCT
    if (
        format === CreativeFormat.BENEFIT_POINTERS // NEW
    ) {
        return "style:high-end-product-photography, lighting:studio-softbox, quality:8k, overlay:clean-white-graphics";
    }

    // Default High End
    return `${style}, quality:8k/masterpiece/sharp-focus`;
};

// --- Strategic Generation ---

// NEW: Analyze Landing Page Content
export const analyzeLandingPageContext = async (markdown: string): Promise<ProjectContext> => {
    const prompt = `
      Role: Senior Marketing Strategist.
      Task: Analyze the following landing page content (markdown) and extract the core marketing context.
      
      Content:
      """
      ${markdown.slice(0, 25000)} 
      """
      (Content truncated for analysis)

      Output strict JSON:
      {
        "productName": "The explicit name of the product/service",
        "productDescription": "A concise, persuasive summary of what it is and the main value prop (max 2 sentences)",
        "targetAudience": "The specific demographic or psychographic groups targeting",
        "targetCountry": "The primary country or region this product targets (e.g. Indonesia, USA)"
      }
    `;

    try {
        const response = await runWithRetry<GenerateContentResponse>(() => ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        productName: { type: Type.STRING },
                        productDescription: { type: Type.STRING },
                        targetAudience: { type: Type.STRING },
                        targetCountry: { type: Type.STRING }
                    },
                    required: ["productName", "productDescription", "targetAudience"]
                }
            }
        }));

        return JSON.parse(response.text || "{}") as ProjectContext;
    } catch (e) {
        console.error("Analysis Failed", e);
        throw new Error("Could not analyze landing page content.");
    }
};

// NEW: Analyze Image Content (Multimodal)
export const analyzeImageContext = async (base64Image: string): Promise<ProjectContext> => {
    // Strip header if present
    const base64Data = base64Image.replace(/^data:image\/\w+;base64,/, "");

    const prompt = `
      Role: Expert Product Analyst & Reverse Engineer.
      Task: Look at this image (it could be a product shot or an existing ad).
      1. Identify the product being sold.
      2. Deduce its core value proposition.
      3. Profiling who this product is for.
      4. Detect the language or cultural context if visible.

      Output strict JSON:
      {
        "productName": "Name of product (guess if not visible)",
        "productDescription": "Persuasive summary of what it does and the benefit shown.",
        "targetAudience": "Demographic/Psychographic profile based on the visual aesthetic.",
        "targetCountry": "Guessed target country based on text/models (e.g. Indonesia, USA, Global)"
      }
    `;

    try {
        const response = await runWithRetry<GenerateContentResponse>(() => ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: {
                parts: [
                    { inlineData: { mimeType: "image/png", data: base64Data } },
                    { text: prompt }
                ]
            },
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        productName: { type: Type.STRING },
                        productDescription: { type: Type.STRING },
                        targetAudience: { type: Type.STRING },
                        targetCountry: { type: Type.STRING }
                    },
                    required: ["productName", "productDescription", "targetAudience"]
                }
            }
        }));

        return JSON.parse(response.text || "{}") as ProjectContext;
    } catch (e) {
        console.error("Image Analysis Failed", e);
        throw new Error("Could not analyze image.");
    }
};

export const generatePersonas = async (project: ProjectContext): Promise<GenResult<any[]>> => {
  // BRAND VOICE INJECTION
  const brandContext = project.brandVoice ? `Brand Voice: ${project.brandVoice}. Ensure personas align with this tone.` : '';
  const countryContext = project.targetCountry ? `TARGET COUNTRY: ${project.targetCountry}. Names and cultural behaviors MUST be native to ${project.targetCountry}.` : 'Global Audience.';

  const prompt = `
    Role: Senior Consumer Psychologist & Strategist.
    Product: ${project.productName} (${project.productDescription}).
    Audience: ${project.targetAudience}.
    ${countryContext}
    ${brandContext}

    Task: Identify the 3 most distinct and profitable Psychological Archetypes for this product in ${project.targetCountry || "the market"}.
    Do NOT just give generic names like "Busy Mom". Be specific and vivid.
    
    IMPORTANT: Use culturally appropriate names and contexts for ${project.targetCountry || "Western markets"}.

    Return JSON Array:
    [{
      "name": "Creative Name (e.g., 'Budi the Corporate Dad' for Indonesia, 'John the Tech Bro' for USA)",
      "profile": "A vivid 1-sentence description including age, role, and specific context (e.g., '40s male, high income, works 60h weeks in Jakarta').",
      "motivation": "Core emotional driver (Why they buy)",
      "deepFear": "Specific anxiety or pain point",
      "secretDesire": "Unspoken want"
    }]
  `;

  try {
    const response = await runWithRetry<GenerateContentResponse>(() => ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING },
              profile: { type: Type.STRING },
              motivation: { type: Type.STRING },
              deepFear: { type: Type.STRING },
              secretDesire: { type: Type.STRING }
            },
            required: ["name", "profile", "motivation", "deepFear"]
          }
        }
      }
    }));
    
    return {
        data: JSON.parse(response.text || "[]"),
        inputTokens: response.usageMetadata?.promptTokenCount || 0,
        outputTokens: response.usageMetadata?.candidatesTokenCount || 0
    };
  } catch (error) {
    console.error("Error generating personas:", error);
    // Fallback if AI fails completely
    return { 
        data: [{ name: "The Ideal Customer", profile: "Matches target audience perfectly.", motivation: "To solve their problem", deepFear: "Failure", secretDesire: "Success" }], 
        inputTokens: 0, 
        outputTokens: 0 
    };
  }
};

export const generateAngles = async (project: ProjectContext, personaName: string, motivation: string): Promise<GenResult<any[]>> => {
  // EUGENE SCHWARTZ AWARENESS LOGIC
  let awarenessStrategy = "";
  switch (project.marketAwareness) {
      case MarketAwareness.UNAWARE:
          awarenessStrategy = "Strategy: UNAWARE Audience. Do NOT mention the product or technical features in the hook. Focus on the symptom, a story, or a shocking fact. Bridge to the problem.";
          break;
      case MarketAwareness.PROBLEM_AWARE:
          awarenessStrategy = "Strategy: PROBLEM AWARE Audience. Focus heavily on the pain point and agitation. Show empathy. 'Does your back hurt?'";
          break;
      case MarketAwareness.SOLUTION_AWARE:
          awarenessStrategy = "Strategy: SOLUTION AWARE Audience. Focus on mechanism. Why current solutions fail and why this new way is better. Comparison.";
          break;
      case MarketAwareness.PRODUCT_AWARE:
          awarenessStrategy = "Strategy: PRODUCT AWARE Audience. They know you. Focus on the OFFER, the Deal, and overcoming hesitation.";
          break;
      case MarketAwareness.MOST_AWARE:
          awarenessStrategy = "Strategy: MOST AWARE Audience. Urgency. Scarcity. 'Last chance'.";
          break;
      default:
          awarenessStrategy = "Strategy: Focus on high-impact hooks.";
  }

  const countryContext = project.targetCountry ? `Cultural Context: Adapt the hooks for ${project.targetCountry}. Use cultural nuances/slang appropriate for this region.` : '';

  const prompt = `
    Role: Direct Response Copywriter (Eugene Schwartz Method).
    Context: Selling ${project.productName} to "${personaName}" (Motivation: ${motivation}).
    Market Awareness Level: ${project.marketAwareness || 'General'}.
    ${countryContext}
    
    INSTRUCTION: ${awarenessStrategy}
    
    Task: Generate 3 high-converting Ad Angles/Hooks.
    They should be distinct (e.g., one logic-based, one fear-based, one aspirational).

    Return JSON Array:
    [{ "headline": "Punchy Hook (<8 words)", "painPoint": "Visceral detail of the problem/desire" }]
  `;

  try {
    const response = await runWithRetry<GenerateContentResponse>(() => ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              headline: { type: Type.STRING },
              painPoint: { type: Type.STRING }
            },
            required: ["headline", "painPoint"]
          }
        }
      }
    }));
    return {
        data: JSON.parse(response.text || "[]"),
        inputTokens: response.usageMetadata?.promptTokenCount || 0,
        outputTokens: response.usageMetadata?.candidatesTokenCount || 0
    };
  } catch (error) {
    return { data: [{ headline: "Discover " + project.productName, painPoint: "General need" }], inputTokens: 0, outputTokens: 0 };
  }
};

// --- STRATEGIST AGENT (The Bridge) ---

export const generateCreativeConcept = async (
    project: ProjectContext, 
    personaName: string, 
    angle: string,
    format: CreativeFormat
): Promise<GenResult<CreativeConcept>> => {
    
    const brandInstruction = project.brandVoice ? `Brand Voice: ${project.brandVoice}.` : '';
    const countryContext = project.targetCountry ? `TARGET COUNTRY: ${project.targetCountry}. Visuals must feature people/environments native to ${project.targetCountry}.` : '';

    const prompt = `
        Role: World-Class Creative Art Director & Strategist.
        Task: Create a cohesive Ad Concept that is VISUALLY DISTINCT.
        Product: ${project.productName}. 
        Target Persona: ${personaName}. 
        Hook: ${angle}.
        Format: ${format}.
        ${brandInstruction}
        ${countryContext}
        
        CRITICAL VISUAL GOAL: We need "Strategic Creative Diversity".
        The visual must NOT look like a generic ad. It must have a specific "Texture" and "Vibe".
        
        Define specific Art Direction details:
        1. Lighting (e.g., Harsh flash, Golden hour, Studio softbox, Neon, Darkroom).
        2. Camera/Device (e.g., iPhone 6 Grainy, 35mm Film, Security Cam, Sharp Mirrorless, GoPro POV).
        3. Color Grade (e.g., Muted, Vibrant Gen-Z, Pastel, Dark & Moody, Monochrome).

        The Visual Scene and the Copy Direction must perfectly match.

        Return JSON:
        {
            "visualScene": "Detailed description of the action/subject.",
            "visualStyle": "Specific keywords for Lighting, Texture, and Camera Angle (e.g. 'Flash photography, grainy texture, messy background').",
            "technicalPrompt": "Comma-separated visual tags for the image generator (e.g. '35mm, f/1.8, bokeh, motion blur, 4k').",
            "copyAngle": "The specific psychological angle the copywriter should take.",
            "rationale": "Why this specific visual style captures this persona."
        }
    `;

    try {
        const response = await runWithRetry<GenerateContentResponse>(() => ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        visualScene: { type: Type.STRING },
                        visualStyle: { type: Type.STRING },
                        technicalPrompt: { type: Type.STRING },
                        copyAngle: { type: Type.STRING },
                        rationale: { type: Type.STRING }
                    },
                    required: ["visualScene", "visualStyle", "technicalPrompt", "copyAngle", "rationale"]
                }
            }
        }));

        return {
            data: JSON.parse(response.text || "{}") as CreativeConcept,
            inputTokens: response.usageMetadata?.promptTokenCount || 0,
            outputTokens: response.usageMetadata?.candidatesTokenCount || 0
        };
    } catch (e) {
        return {
            data: { visualScene: `Shot of ${project.productName}`, visualStyle: "Studio lighting", technicalPrompt: "high quality", copyAngle: angle, rationale: "Default" },
            inputTokens: 0,
            outputTokens: 0
        }
    }
}

// --- COMPLIANCE AGENT ---

export const checkAdCompliance = async (copy: AdCopy): Promise<string> => {
    const prompt = `
        Role: Meta Ads Policy & Compliance Officer.
        Task: Review this ad copy for banned content.
        
        Rules:
        1. No personal attributes ("Are you fat?", "You look tired").
        2. No misleading health claims ("Cures cancer", "Lose 10lbs overnight").
        3. No false scarcity or button imagery in image text.
        4. No profanity.

        Copy to check:
        Headline: ${copy.headline}
        Primary: ${copy.primaryText}

        If compliant, return "COMPLIANT".
        If risky, return a SHORT warning explaining why.
    `;

    try {
        const response = await runWithRetry<GenerateContentResponse>(() => ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt
        }));
        const result = response.text?.trim() || "COMPLIANT";
        return result.includes("COMPLIANT") ? "Safe" : result;
    } catch (e) {
        return "Check Failed";
    }
}

export const generateAdCopy = async (
    project: ProjectContext, 
    personaName: string, 
    concept: CreativeConcept
): Promise<GenResult<AdCopy>> => {
    
    // BUILD CONTEXT STRINGS
    const voiceInstruction = project.brandVoice ? `Tone of Voice: ${project.brandVoice}.` : "Tone: Authentic, human, no AI buzzwords.";
    const offerContext = project.offer ? `THE OFFER: "${project.offer}". This is the Closer. Make it irresistible.` : "";
    const countryContext = project.targetCountry 
        ? `LANGUAGE RULE: Output STRICTLY in the native language of ${project.targetCountry}. Use local idioms/currency.` 
        : "Language: English (US).";
    
    // FRAMEWORK INSTRUCTION
    let frameworkInstruction = "";
    switch (project.copyFramework) {
        case CopyFramework.PAS:
            frameworkInstruction = "Framework: P.A.S. (Problem -> Agitation -> Solution). Start with pain, twist the knife, present product as the only saviour.";
            break;
        case CopyFramework.AIDA:
            frameworkInstruction = "Framework: A.I.D.A. (Attention -> Interest -> Desire -> Action). Hook them, keep them reading, make them want it, tell them what to do.";
            break;
        case CopyFramework.BAB:
            frameworkInstruction = "Framework: B.A.B. (Before -> After -> Bridge). Show the hell they are in, the heaven they want, and how the product bridges the gap.";
            break;
        case CopyFramework.FAB:
            frameworkInstruction = "Framework: F.A.B. (Features -> Advantages -> Benefits). Don't just list specs, explain why they matter.";
            break;
        case CopyFramework.STORY:
            frameworkInstruction = "Framework: Storytelling. Open in media res. Use a micro-narrative of transformation.";
            break;
        default:
            frameworkInstruction = "Framework: High Conversion Direct Response.";
    }

    const prompt = `
      Role: Expert Direct Response Copywriter.
      Product: ${project.productName}. 
      Target: ${personaName}. 
      Direction: ${concept.copyAngle}.
      Visual Context: The image will show ${concept.visualScene}.
      
      ${voiceInstruction}
      ${offerContext}
      ${frameworkInstruction}
      ${countryContext}

      Rules: 
      - Start with a strong hook (First 3 lines matter most).
      - Match the visual context.
      - Keep it compliant (no prohibited claims).
      - If an Offer exists, End with it + CTA.

      Return JSON: { "primaryText": "...", "headline": "...", "cta": "..." }
    `;
  
    try {
      const response = await runWithRetry<GenerateContentResponse>(() => ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              primaryText: { type: Type.STRING },
              headline: { type: Type.STRING },
              cta: { type: Type.STRING }
            },
            required: ["primaryText", "headline", "cta"]
          }
        }
      }));
      return {
          data: JSON.parse(response.text || "{}") as AdCopy,
          inputTokens: response.usageMetadata?.promptTokenCount || 0,
          outputTokens: response.usageMetadata?.candidatesTokenCount || 0
      };
    } catch (error) {
      return { 
          data: { primaryText: "Check out this product.", headline: concept.copyAngle, cta: "Shop Now" }, 
          inputTokens: 0, 
          outputTokens: 0 
      };
    }
  };

// --- CREATIVE DIRECTOR ---

export const generateVisualStyle = async (
    project: ProjectContext, 
    personaName: string, 
    angle: string
): Promise<GenResult<string>> => {
    const prompt = `
        Role: Art Director.
        Prod: ${project.productName}. Target: ${personaName}. Angle: ${angle}.
        Task: Define a unique VISUAL VIBE (Lighting, Color, Texture). 1 sentence.
    `;

    try {
        const response = await runWithRetry<GenerateContentResponse>(() => ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
        }));
        return {
            data: response.text || "Studio lighting, clean background.",
            inputTokens: response.usageMetadata?.promptTokenCount || 0,
            outputTokens: response.usageMetadata?.candidatesTokenCount || 0
        };
    } catch (e) {
        return { data: "Professional studio lighting.", inputTokens: 0, outputTokens: 0 };
    }
}

// --- Image Generation ---

const callImageGen = async (prompt: string, aspectRatio: string = "1:1", referenceImage?: string): Promise<GenResult<string | null>> => {
    try {
        let contents: any = { parts: [{ text: prompt }] };

        // If a reference image is provided, pass it to the model to influence the generation
        if (referenceImage) {
             const base64Data = referenceImage.replace(/^data:image\/\w+;base64,/, "");
             contents.parts.unshift({
                inlineData: {
                    mimeType: "image/png", 
                    data: base64Data
                }
             });
        }

        const response = await runWithRetry<GenerateContentResponse>(() => ai.models.generateContent({
          model: 'gemini-2.5-flash-image',
          contents: contents,
          config: { imageConfig: { aspectRatio: aspectRatio } }
        }), 2, 2000); 
    
        let url = null;
        for (const part of response.candidates?.[0]?.content?.parts || []) {
          if (part.inlineData && part.inlineData.data) {
            url = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
          }
        }
        
        return {
            data: url,
            inputTokens: response.usageMetadata?.promptTokenCount || 0,
            outputTokens: response.usageMetadata?.candidatesTokenCount || 0 
        };
      } catch (error) {
        console.error("Error generating image:", error);
        return { data: null, inputTokens: 0, outputTokens: 0 };
      }
}

// Helper to construct efficient prompts
const constructImagePrompt = (
    subject: string, 
    context: string, 
    medium: string, 
    scene: string, 
    visualStyle: string, 
    technicalTags: string,
    hasReferenceImage: boolean = false,
    targetCountry: string = ""
) => {
    // Token-Efficient Prompt Structure
    let prompt = `
    CMD: Generate Image.
    SUBJECT: ${subject}
    CONTEXT: ${context}
    MEDIUM: ${medium} (Influenced by: ${visualStyle})
    SCENE: ${scene}
    VISUAL STYLE: ${visualStyle}
    TECH SPECS: ${technicalTags}
    RULES: Authentic look. If UI is requested, ensure icons and text layouts look native (like a screenshot).
    `;
    
    if (targetCountry) {
        prompt += ` DEMOGRAPHIC: Models/People MUST appear to be native to ${targetCountry} (Ethnicity/Clothing/Environment).`;
    }

    if (hasReferenceImage) {
        prompt += " INSTRUCTION: Use the provided product image as the visual reference for the SUBJECT. Integrate it naturally into the scene.";
    }

    return prompt;
};

export const generateCreativeImage = async (
  project: ProjectContext,
  personaName: string,
  angleHeadline: string,
  format: CreativeFormat,
  visualScene: string,
  visualStyle: string,
  technicalPrompt: string,
  aspectRatio: string = "1:1"
): Promise<GenResult<string | null>> => {
  
  // --- LOGIC DEFINITION (Client Side - No Token Cost) ---
  
  let medium = "Photography";
  let sceneDescription = visualScene; // Use the Creative Director's detailed scene
  let isLoFi = false;
  let isVector = false;

  // We optimize these descriptions to be concise for the prompt
  switch (format) {
    // --- INSTAGRAM NATIVE / APP UI ---
    
    // NEW: The "Influencer Q&A" Look
    case CreativeFormat.STORY_QNA:
        medium = "SMARTPHONE SCREENSHOT (INSTAGRAM STORY OVERLAY)";
        isLoFi = true;
        if (!sceneDescription) {
            sceneDescription = `
            Visual is a vertical phone screenshot of an Instagram Story.
            BACKGROUND LAYER: A high-quality, authentic photo of ${project.productName} being held in a hand or placed on a bathroom counter. Good lighting, depth of field.
            UI LAYER (MUST INCLUDE): 
            1. UPPER CENTER: A white 'Ask Me Anything' Question Box sticker. Header is black saying 'Ask Me Anything'. The question text inside says: 'Spill the tea on ${angleHeadline} ☕'.
            2. ADDED ELEMENTS: Hand-drawn style arrow pointing from the question box to the product.
            3. TEXT BUBBLES: Floating text bubbles (Green or Pink background) with testimonials like "Magic potion!" or "Obsessed".
            4. BOTTOM: 'Send message' pill-shaped text field.
            `;
        }
        break;

    case CreativeFormat.STORY_POLL:
        medium = "SMARTPHONE SCREENSHOT (INSTAGRAM STORY)";
        isLoFi = true; 
        if (!sceneDescription) {
            sceneDescription = `
            Visual is a vertical phone screenshot of an Instagram Story. 
            BACKGROUND: Authentic photo/video of ${project.productName} in a lifestyle setting.
            UI OVERLAY: 
            1. Top: Thin white progress bar dashes + Profile picture & name '${personaName}' in top left + 'X' icon top right.
            2. Center: A standard Instagram interactive POLL STICKER. Question: '${angleHeadline}?'. Options: 'Yes / Definitely'.
            3. Bottom: 'Send message' pill-shaped text field + Heart icon.
            Perspective: Flat 2D screen capture.
            `;
        }
        break;

    case CreativeFormat.REELS_THUMBNAIL:
        medium = "INSTAGRAM REELS INTERFACE";
        if (!sceneDescription) {
            sceneDescription = `
            Visual is a vertical phone screenshot of an Instagram Reel.
            CONTENT: Engaging video frame of ${project.productName}. 
            UI OVERLAY:
            1. Right Side column icons (from top to bottom): Heart (Like), Comment Bubble, Paper Plane (Share), Three dots.
            2. Bottom Left: Profile text '${personaName}' and caption text '${angleHeadline}' overlaid on the video.
            3. Very Bottom: Music track ticker icon.
            Vibe: Viral, high energy.
            `;
        }
        break;

    case CreativeFormat.DM_NOTIFICATION:
        medium = "IPHONE LOCKSCREEN NOTIFICATION";
        isVector = true;
        sceneDescription = `
        Realistic iPhone Lockscreen.
        BACKGROUND: Blurred depth-of-field lifestyle wallpaper (warm cozy vibe).
        UI ELEMENT: A distinct 'Instagram' push notification banner in the center.
        ICON: Instagram App Icon.
        TITLE: 'Instagram'.
        MESSAGE: 'Direct Message from ${project.productName}: ${angleHeadline}'.
        Time: 09:41 at the top.
        `;
        break;

    case CreativeFormat.UGC_MIRROR:
        medium = "MIRROR SELFIE (INSTAGRAM STORY STYLE)";
        isLoFi = true;
        if (!sceneDescription) {
            sceneDescription = `
            Gen-Z style bathroom mirror selfie taken with a phone covering the face.
            SUBJECT: Person holding ${project.productName} visibly.
            STYLE: Flash photography, slight grain, authentic aesthetic.
            UI OVERLAY: Instagram Story text overlay typed in 'Neon' or 'Modern' font saying: "${angleHeadline}".
            Drawing tool doodles (scribbles) around the product.
            `;
        }
        break;

    case CreativeFormat.TWITTER_REPOST:
        medium = "FLAT VECTOR UI SCREENSHOT";
        isVector = true;
        sceneDescription = `Twitter post. Profile: circular pic. User: @${personaName.replace(/\s/g, '')}. Content: '${angleHeadline}'. UI: Reply/Like icons.`;
        break;

    case CreativeFormat.GMAIL_UX:
        medium = "FLAT VECTOR EMAIL UI";
        isVector = true;
        sceneDescription = `Gmail inbox view. Subject: '${angleHeadline}'. From: ${project.productName}. UI: Standard white/gray interface.`;
        break;

    case CreativeFormat.PHONE_NOTES:
        medium = "FLAT 2D PHONE NOTES APP";
        isVector = true;
        sceneDescription = `Apple Notes interface. Background: Yellow texture. Text: '${angleHeadline}'. UI: Back arrow.`;
        break;
    
    case CreativeFormat.REMINDER_NOTIF:
        medium = "FLAT LOCKSCREEN UI";
        isVector = true;
        sceneDescription = `Phone lockscreen. Blurred wallpaper. Notification banner: 'Reminder: ${angleHeadline}'.`;
        break;
    
    case CreativeFormat.CHAT_CONVERSATION:
        medium = "FLAT MESSAGING UI";
        isVector = true;
        sceneDescription = `Chat screen. Bubbles: 'I need help...' (Gray) vs '${angleHeadline}' (Blue).`;
        break;

    case CreativeFormat.SEARCH_BAR:
        medium = "MINIMAL WEB UI";
        isVector = true;
        sceneDescription = `Google search bar. Text: '${angleHeadline}'. Dropdown suggestions. White background.`;
        break;

    // --- NEW DIRECT RESPONSE FORMATS ---

    case CreativeFormat.BENEFIT_POINTERS:
        medium = "PRODUCT PHOTOGRAPHY WITH INFOGRAPHIC ELEMENTS";
        if (!sceneDescription) {
            sceneDescription = `
            High-end studio shot of ${project.productName} centered.
            OVERLAY: Thin white lines pointing to 3 distinct features of the product.
            LABELS: At the end of each line, a small white floating bubble containing short text (e.g., 'Hydrating', 'Organic').
            VIBE: Clinical, Educational, Premium.
            `;
        }
        break;

    case CreativeFormat.SOCIAL_COMMENT_STACK:
        medium = "COMPOSITE SOCIAL MEDIA IMAGE";
        if (!sceneDescription) {
            sceneDescription = `
            BACKGROUND: Authentic UGC lifestyle photo of ${project.productName} in use.
            OVERLAY: 3 or 4 distinct Social Media Comment bubbles (Instagram or TikTok style) stacked vertically in the center, partially covering the product.
            CONTENT: Comments should say things like 'I need this!', 'Life saver 😍', 'Best purchase ever'.
            VIBE: Viral sensation, overwhelming social proof.
            `;
        }
        break;

    case CreativeFormat.STICKY_NOTE_REALISM:
        medium = "REALISTIC PHOTO";
        isLoFi = true;
        if (!sceneDescription) {
            sceneDescription = `
            A yellow Post-it note is stuck physically onto the packaging of ${project.productName} or on a mirror next to it.
            TEXT: Handwritten black marker text on the note saying: "${angleHeadline}".
            STYLE: Authentic, messy, real life texture.
            `;
        }
        break;

    case CreativeFormat.HANDHELD_TWEET:
        medium = "POV PHOTOGRAPHY WITH UI OVERLAY";
        isLoFi = true;
        if (!sceneDescription) {
            sceneDescription = `
            First-person POV shot of a hand holding ${project.productName} in a bathroom or bedroom.
            OVERLAY: A sharp, crisp Twitter/X post card floating in the center.
            TWEET CONTENT: User avatar + Text saying: "${angleHeadline}".
            VIBE: Storytelling, candid, relatable.
            `;
        }
        break;

    // --- LO-FI / RAW (UGLY) ---
    case CreativeFormat.UGLY_VISUAL:
    case CreativeFormat.REDDIT_THREAD:
    case CreativeFormat.US_VS_THEM:
        medium = "AMATEUR PHONE PHOTO";
        isLoFi = true;
        if (!sceneDescription) sceneDescription = `Messy candid shot of ${project.productName} on cluttered table. Harsh flash. Authentic UGC.`;
        break;

    case CreativeFormat.POV_HANDS:
        medium = "FIRST PERSON POV PHOTO";
        isLoFi = true;
        if (!sceneDescription) sceneDescription = `POV looking down at hands holding ${project.productName}. Background: messy room. Lighting: Flash.`;
        break;

    case CreativeFormat.MEME:
    case CreativeFormat.MS_PAINT:
        medium = "CRUDE DIGITAL DRAWING";
        isLoFi = true;
        sceneDescription = `Poorly drawn MS Paint doodle about '${angleHeadline}'. Stick figures. Comic sans. Internet humor.`;
        break;

    // --- HYBRID ---
    case CreativeFormat.STORY_POLL:
        // Already handled above
        break;

    // --- VECTOR / EDUCATIONAL ---
    case CreativeFormat.CAROUSEL_EDUCATIONAL:
    case CreativeFormat.GRAPH_CHART:
    case CreativeFormat.TIMELINE_JOURNEY:
    case CreativeFormat.CHECKLIST_TODO:
    case CreativeFormat.WHITEBOARD:
    case CreativeFormat.CARTOON:
        medium = "FLAT VECTOR ILLUSTRATION";
        isVector = true;
        if (!sceneDescription) sceneDescription = `Minimalist infographic for '${angleHeadline}'. Style: Corporate Memphis / Flat Design. Solid background.`;
        break;
        
    case CreativeFormat.BIG_FONT:
        medium = "TYPOGRAPHY POSTER";
        isVector = true;
        sceneDescription = `Text '${angleHeadline}' is hero. Font: Massive bold sans-serif. High contrast colors.`;
        break;

    case CreativeFormat.COLLAGE_SCRAPBOOK:
        medium = "MIXED MEDIA COLLAGE";
        if (!sceneDescription) sceneDescription = `Chaotic collage of ${project.productName}, ripped paper, tape, notes. Punk zine style.`;
        break;

    // --- HIGH END ---
    case CreativeFormat.AESTHETIC_MINIMAL:
    case CreativeFormat.CAROUSEL_TESTIMONIAL:
    case CreativeFormat.CAROUSEL_PANORAMA:
    case CreativeFormat.CAROUSEL_PHOTO_DUMP:
    case CreativeFormat.ANNOTATED_PRODUCT:
    case CreativeFormat.BILLBOARD:
        medium = "HIGH END COMMERCIAL PHOTO";
        if (!sceneDescription) sceneDescription = `Award-winning product shot of ${project.productName}. Composition: Minimal.`;
        break;

    // --- REAL PEOPLE STORY (NEW) ---
    case CreativeFormat.CAROUSEL_REAL_STORY:
        medium = "CANDID SMARTPHONE PHOTOGRAPHY";
        isLoFi = true; // Essential for the real look
        if (!sceneDescription) sceneDescription = `A real person holding ${project.productName} in a candid selfie style. Background is a normal bedroom or living room.`;
        break;

    default:
        medium = "PRODUCT PHOTO";
        if (!sceneDescription) sceneDescription = `Standard commercial shot of ${project.productName}.`;
        break;
  }

  // --- STYLE OVERRIDE LOGIC ---
  let activeStyle = "";
  if (isLoFi) activeStyle = "Raw, amateur, authentic";
  else if (isVector) activeStyle = "Flat, vector, minimal";
  else activeStyle = "Professional, sharp";

  const technicalBoosters = getVisualEnhancers(activeStyle, format);
  
  // MERGE AI ART DIRECTION WITH CHASSIS
  // We combine the format-specific enhancers with the AI's custom technical tags
  const combinedTechnicalTags = `${technicalBoosters}, ${technicalPrompt}`;

  // Construct concise prompt to save tokens
  const prompt = constructImagePrompt(
      project.productName, 
      angleHeadline, 
      medium, 
      sceneDescription, 
      visualStyle || activeStyle, // Prioritize AI Visual Style
      combinedTechnicalTags,
      !!project.productReferenceImage, // Pass true if reference image exists
      project.targetCountry || "" // Pass Target Country
  );

  return callImageGen(prompt, aspectRatio, project.productReferenceImage);
};

export const generateCarouselSlides = async (
    project: ProjectContext,
    format: CreativeFormat,
    angleHeadline: string,
    visualScene: string,
    visualStyle: string,
    technicalPrompt: string
): Promise<GenResult<string[]>> => {
    const isEducational = format === CreativeFormat.CAROUSEL_EDUCATIONAL;
    
    let slidePrompts: string[] = [];
    let inputTokens = 0;
    let outputTokens = 0;

    const countryContext = project.targetCountry ? `Language: ${project.targetCountry} Native.` : '';

    if (isEducational) {
       // ... existing educational logic ...
       // --- JSON PARSING SAFETY ---
       const copyPrompt = `
          Task: Write 4 short carousel slide texts for: "${angleHeadline}".
          ${countryContext}
          Return JSON Array of 4 strings (Max 5 words each).
       `;

       try {
            const textResponse = await runWithRetry<GenerateContentResponse>(() => ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: copyPrompt,
                config: {
                    responseMimeType: "application/json",
                    responseSchema: { type: Type.ARRAY, items: { type: Type.STRING } }
                }
            }));
            
            // Safe Parse inside Try/Catch
            const texts = JSON.parse(textResponse.text || "[]");
            inputTokens += textResponse.usageMetadata?.promptTokenCount || 0;
            outputTokens += textResponse.usageMetadata?.candidatesTokenCount || 0;

            const enhancers = getVisualEnhancers("flat", format);

            slidePrompts = texts.map((t: string) => 
                `CMD: Gen Flat Vector Slide. CENTER TEXT: "${t}". STYLE: Minimal geometric. SPECS: ${enhancers}, ${technicalPrompt}`
            );
       } catch (e) {
            console.error("Educational Carousel Text Gen Failed", e);
            slidePrompts = ["Hook", "Problem", "Solution", "Outcome"].map(t => `CMD: Gen Slide. TEXT: ${t}. STYLE: Flat Vector.`);
       }
    } else {
       // --- VISUAL CAROUSELS ---
       
       let basePrompt = "";
       
       // NEW LOGIC FOR REAL STORY UGC
       if (format === CreativeFormat.CAROUSEL_REAL_STORY) {
           const enhancers = getVisualEnhancers("candid", format);
           basePrompt = `
             Context: A 4-slide Instagram Carousel telling a PERSONAL STORY about using ${project.productName}.
             Visual Style: ${visualStyle}
             Style: ${enhancers}. Authentic User Generated Content (UGC), Smartphone Photography.
             Target Country/Demographic: ${project.targetCountry || "Global"} Native.
             
             Task: Describe 4 sequential photos that form a narrative.
             Slide 1: The Struggle/Hook (Selfie showing emotion/problem or tired face). Text Overlay: "${angleHeadline}".
             Slide 2: The Discovery (Holding the product in a messy/real room).
             Slide 3: The Process (Applying/Using the product, close up texture or action shot).
             Slide 4: The Result (Glowing/Happy After shot).
             
             Return JSON Array of 4 string descriptions.
           `;
       } else {
           // Standard Visual Logic
           basePrompt = `
             Context: 4-Slide Visuals for ${project.productName}. 
             Visual Style: ${visualStyle}.
             Scene Base: ${visualScene}.
             ${countryContext}
             Return JSON Array of 4 distinct scene descriptions.
           `;
       }
       
       try {
            const visualResponse = await runWithRetry<GenerateContentResponse>(() => ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: basePrompt,
                config: {
                    responseMimeType: "application/json",
                    responseSchema: { type: Type.ARRAY, items: { type: Type.STRING } }
                }
            }));
            
            const visuals = JSON.parse(visualResponse.text || "[]");
            inputTokens += visualResponse.usageMetadata?.promptTokenCount || 0;
            outputTokens += visualResponse.usageMetadata?.candidatesTokenCount || 0;
            
            // Generate the image prompts
            const enhancers = getVisualEnhancers("candid", format); // Ensure enhancers are available
            const combinedTechnical = `${enhancers}, ${technicalPrompt}`;

            slidePrompts = visuals.map((v: string) => 
                constructImagePrompt(
                    project.productName, 
                    "", // No specific headline needed for sub-slides usually, or can be added if extracted
                    "Photography", 
                    v, 
                    visualStyle || "Authentic", 
                    combinedTechnical, 
                    !!project.productReferenceImage, 
                    project.targetCountry
                )
            );
       } catch (e) {
           slidePrompts = [1,2,3,4].map(() => `CMD: Gen Photo. SUBJECT: ${project.productName}. STYLE: ${visualScene}`);
       }
    }

    // Parallel execution is fine, but prompts are now shorter (saving tokens).
    const images: string[] = [];
    // Pass reference image if available to carousel slides too
    const promises = slidePrompts.map(p => callImageGen(p, "1:1", project.productReferenceImage));
    const results = await Promise.all(promises);

    results.forEach(res => {
        if (res.data) images.push(res.data);
        inputTokens += res.inputTokens;
        outputTokens += res.outputTokens;
    });

    return { data: images, inputTokens, outputTokens };
};

// --- Inspector Tools ---

export const generateAdScript = async (project: ProjectContext, personaName: string, angle: string): Promise<string> => {
    const countryContext = project.targetCountry ? `Language: ${project.targetCountry} native language.` : '';
    const prompt = `
        Role: TikTok Strategist. Prod: ${project.productName}. Hook: ${angle}.
        ${countryContext}
        Write 15s Script. Format: [Visual] Audio.
    `;
    try {
        const response = await runWithRetry<GenerateContentResponse>(() => ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt
        }));
        return response.text || "Script generation failed.";
    } catch (e) { return "Error generating script."; }
};

export const generateVoiceover = async (script: string, personaName: string): Promise<string | null> => {
    try {
        const response = await runWithRetry<GenerateContentResponse>(() => ai.models.generateContent({
            model: 'gemini-2.5-flash', 
            contents: { parts: [{ text: `Read with energetic creator voice. Script: ${script}` }] },
            config: {
                responseModalities: [Modality.AUDIO],
                speechConfig: {
                    voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } }
                }
            }
        }));

        const audioPart = response.candidates?.[0]?.content?.parts?.[0];
        if (audioPart?.inlineData?.data) {
            return audioPart.inlineData.data;
        }
        return null;
    } catch (e) {
        console.error("Voice gen failed", e);
        return null;
    }
};

export const generatePerformanceInsight = async (metrics: any, angle: string): Promise<string> => {
    // Keep prompt simple for efficiency
    const prompt = `
        Analyze Ad Metrics. Angle: ${angle}.
        Spend: $${metrics.spend}, ROAS: ${metrics.roas}, CPA: $${metrics.cpa}.
        Output 1 strategic sentence.
    `;
    try {
        const response = await runWithRetry<GenerateContentResponse>(() => ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt
        }));
        return response.text || "No insight available.";
    } catch (e) { return "Analysis failed."; }
};

export const generateCreativeVariations = async (originalPrompt: string): Promise<GenResult<string>> => {
    return { data: "Remixed content placeholder", inputTokens: 0, outputTokens: 0 };
};