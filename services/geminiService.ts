
import { GoogleGenAI, Type, Modality, GenerateContentResponse } from "@google/genai";
import { CreativeFormat, ProjectContext, AdCopy } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

// --- Types for Responses with Usage ---
export interface GenResult<T> {
  data: T;
  inputTokens: number;
  outputTokens: number;
}

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
    
    // 1. LO-FI / RAW
    if (
        format === CreativeFormat.UGLY_VISUAL || 
        format === CreativeFormat.REDDIT_THREAD ||
        format === CreativeFormat.POV_HANDS ||
        format === CreativeFormat.UGC_MIRROR ||
        format === CreativeFormat.US_VS_THEM ||
        format === CreativeFormat.PHONE_NOTES || 
        format === CreativeFormat.STORY_POLL
    ) {
        return "texture:grainy/noise, lighting:harsh-flash, quality:amateur/raw/authentic, device:smartphone-camera";
    }

    // 2. MEME
    if (format === CreativeFormat.MEME || format === CreativeFormat.MS_PAINT) {
        return "style:ms-paint/doodle, quality:low-res/pixelated, vibe:internet-humor";
    }

    // 3. VECTOR / UI
    if (
        format === CreativeFormat.CAROUSEL_EDUCATIONAL ||
        format === CreativeFormat.GRAPH_CHART ||
        format === CreativeFormat.CARTOON ||
        format === CreativeFormat.WHITEBOARD ||
        format === CreativeFormat.TIMELINE_JOURNEY ||
        format === CreativeFormat.CHECKLIST_TODO ||
        format === CreativeFormat.TWITTER_REPOST ||
        format === CreativeFormat.GMAIL_UX ||
        format === CreativeFormat.SEARCH_BAR ||
        format === CreativeFormat.DM_NOTIFICATION ||
        format === CreativeFormat.CHAT_CONVERSATION ||
        format === CreativeFormat.REMINDER_NOTIF
    ) {
        return "style:flat-vector/minimal-ui, shading:none, depth:2d, color:solid-hex-codes";
    }

    // 4. HIGH END / CINEMATIC (The only place where 'styleContext' truly overrides quality)
    // We inject the Creative Director's vision here.
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
        "targetAudience": "The specific demographic or psychographic groups targeting"
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
                        targetAudience: { type: Type.STRING }
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

      Output strict JSON:
      {
        "productName": "Name of product (guess if not visible)",
        "productDescription": "Persuasive summary of what it does and the benefit shown.",
        "targetAudience": "Demographic/Psychographic profile based on the visual aesthetic."
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
                        targetAudience: { type: Type.STRING }
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
  // DYNAMIC PROMPTING: We ask the AI to identify the archetypes, instead of forcing "Skeptic/Aspirer/Sufferer".
  const prompt = `
    Role: Consumer Psychologist.
    Product: ${project.productName} (${project.productDescription}).
    Audience: ${project.targetAudience}.

    Task: Identify the 3 most distinct and profitable Psychological Archetypes for this product.
    Focus on their internal emotional drivers.

    Return JSON Array:
    [{
      "name": "Creative Name (e.g., The Overwhelmed Parent)",
      "motivation": "Core driver",
      "deepFear": "Specific anxiety",
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
              motivation: { type: Type.STRING },
              deepFear: { type: Type.STRING },
              secretDesire: { type: Type.STRING }
            },
            required: ["name", "motivation", "deepFear"]
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
        data: [{ name: "The Ideal Customer", motivation: "To solve their problem", deepFear: "Failure", secretDesire: "Success" }], 
        inputTokens: 0, 
        outputTokens: 0 
    };
  }
};

export const generateAngles = async (project: ProjectContext, personaName: string, motivation: string): Promise<GenResult<any[]>> => {
  // DYNAMIC PROMPTING: Let AI decide the best angles (Logic, Emotion, Scarcity, Story, etc.)
  const prompt = `
    Role: Direct Response Copywriter.
    Context: Selling ${project.productName} to "${personaName}" (Motivation: ${motivation}).
    
    Task: Generate 3 high-converting Ad Angles/Hooks.
    They should be distinct (e.g., one logic-based, one fear-based, one aspirational).

    Return JSON Array:
    [{ "headline": "Punchy Hook (<8 words)", "painPoint": "Visceral detail" }]
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

export const generateAdCopy = async (project: ProjectContext, personaName: string, angle: string): Promise<GenResult<AdCopy>> => {
    const prompt = `
      Role: Copywriter.
      Prod: ${project.productName}. Target: ${personaName}. Hook: ${angle}.
      Rules: No AI buzzwords. Casual tone.
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
          data: { primaryText: "Check out this product.", headline: angle, cta: "Shop Now" }, 
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
    vibe: string, 
    keywords: string,
    hasReferenceImage: boolean = false
) => {
    // Token-Efficient Prompt Structure
    let prompt = `
    CMD: Generate Image.
    SUBJECT: ${subject}
    CONTEXT: ${context}
    MEDIUM: ${medium}
    SCENE: ${scene}
    VIBE: ${vibe}
    TECH_SPECS: ${keywords}
    RULES: No text labels. No frames.
    `;
    
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
  styleContext: string,
  aspectRatio: string = "1:1"
): Promise<GenResult<string | null>> => {
  
  // --- LOGIC DEFINITION (Client Side - No Token Cost) ---
  
  let medium = "Photography";
  let sceneDescription = "";
  let isLoFi = false;
  let isVector = false;

  // We optimize these descriptions to be concise for the prompt
  switch (format) {
    // --- UI & SOCIAL (FLAT) ---
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

    case CreativeFormat.DM_NOTIFICATION:
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

    // --- LO-FI / RAW (UGLY) ---
    case CreativeFormat.UGLY_VISUAL:
    case CreativeFormat.REDDIT_THREAD:
    case CreativeFormat.US_VS_THEM:
        medium = "AMATEUR PHONE PHOTO";
        isLoFi = true;
        sceneDescription = `Messy candid shot of ${project.productName} on cluttered table. Harsh flash. Authentic UGC.`;
        break;

    case CreativeFormat.POV_HANDS:
        medium = "FIRST PERSON POV PHOTO";
        isLoFi = true;
        sceneDescription = `POV looking down at hands holding ${project.productName}. Background: messy room. Lighting: Flash.`;
        break;
    
    case CreativeFormat.UGC_MIRROR:
        medium = "MIRROR SELFIE PHOTO";
        isLoFi = true;
        sceneDescription = `Bathroom mirror selfie. Hand holding phone. ${project.productName} on counter. Casual influencer vibe.`;
        break;

    case CreativeFormat.MEME:
    case CreativeFormat.MS_PAINT:
        medium = "CRUDE DIGITAL DRAWING";
        isLoFi = true;
        sceneDescription = `Poorly drawn MS Paint doodle about '${angleHeadline}'. Stick figures. Comic sans. Internet humor.`;
        break;

    // --- HYBRID ---
    case CreativeFormat.STORY_POLL:
        medium = "PHONE PHOTO + UI OVERLAY";
        isLoFi = true;
        sceneDescription = `Vertical shot of ${project.productName}. Overlay: Instagram 'Poll' sticker. Question: '${angleHeadline}?'.`;
        break;

    case CreativeFormat.REELS_THUMBNAIL:
        medium = "VIDEO THUMBNAIL";
        sceneDescription = `Action shot of ${project.productName}. Overlay: Play button. Bold text: '${angleHeadline}'.`;
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
        sceneDescription = `Minimalist infographic for '${angleHeadline}'. Style: Corporate Memphis / Flat Design. Solid background.`;
        break;
        
    case CreativeFormat.BIG_FONT:
        medium = "TYPOGRAPHY POSTER";
        isVector = true;
        sceneDescription = `Text '${angleHeadline}' is hero. Font: Massive bold sans-serif. High contrast colors.`;
        break;

    case CreativeFormat.COLLAGE_SCRAPBOOK:
        medium = "MIXED MEDIA COLLAGE";
        sceneDescription = `Chaotic collage of ${project.productName}, ripped paper, tape, notes. Punk zine style.`;
        break;

    // --- HIGH END ---
    case CreativeFormat.AESTHETIC_MINIMAL:
    case CreativeFormat.CAROUSEL_TESTIMONIAL:
    case CreativeFormat.CAROUSEL_PANORAMA:
    case CreativeFormat.CAROUSEL_PHOTO_DUMP:
    case CreativeFormat.ANNOTATED_PRODUCT:
    case CreativeFormat.BILLBOARD:
        medium = "HIGH END COMMERCIAL PHOTO";
        sceneDescription = `Award-winning product shot of ${project.productName}. Composition: ${styleContext || "Minimal"}.`;
        break;

    default:
        medium = "PRODUCT PHOTO";
        sceneDescription = `Standard commercial shot of ${project.productName}.`;
        break;
  }

  // --- STYLE OVERRIDE LOGIC ---
  let activeStyle = styleContext;
  if (!activeStyle || isLoFi || isVector) {
      if (isLoFi) activeStyle = "Raw, amateur, authentic";
      else if (isVector) activeStyle = "Flat, vector, minimal";
      else activeStyle = "Professional, sharp";
  }

  const technicalBoosters = getVisualEnhancers(activeStyle, format);
  
  // Construct concise prompt to save tokens
  const prompt = constructImagePrompt(
      project.productName, 
      angleHeadline, 
      medium, 
      sceneDescription, 
      activeStyle, 
      technicalBoosters,
      !!project.productReferenceImage // Pass true if reference image exists
  );

  return callImageGen(prompt, aspectRatio, project.productReferenceImage);
};

export const generateCarouselSlides = async (
    project: ProjectContext,
    format: CreativeFormat,
    angleHeadline: string,
    styleContext: string
): Promise<GenResult<string[]>> => {
    const isEducational = format === CreativeFormat.CAROUSEL_EDUCATIONAL;
    
    let slidePrompts: string[] = [];
    let inputTokens = 0;
    let outputTokens = 0;

    if (isEducational) {
       // --- JSON PARSING SAFETY ---
       const copyPrompt = `
          Task: Write 4 short carousel slide texts for: "${angleHeadline}".
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
                `CMD: Gen Flat Vector Slide. CENTER TEXT: "${t}". STYLE: Minimal geometric. SPECS: ${enhancers}`
            );
       } catch (e) {
            console.error("Educational Carousel Text Gen Failed", e);
            slidePrompts = ["Hook", "Problem", "Solution", "Outcome"].map(t => `CMD: Gen Slide. TEXT: ${t}. STYLE: Flat Vector.`);
       }
    } else {
       // Visual Formats
       const enhancers = getVisualEnhancers(styleContext, format);
       const basePrompt = `
         Context: 4-Slide Visuals for ${project.productName}. Style: ${styleContext}.
         Return JSON Array of 4 distinct scene descriptions.
       `;
       
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
            
            slidePrompts = visuals.map((v: string) => 
                `CMD: Gen Photo. SCENE: ${v}. STYLE: ${styleContext}. SPECS: ${enhancers} ${project.productReferenceImage ? 'INSTRUCTION: Use reference image product.' : ''}`
            );
       } catch (e) {
           slidePrompts = [1,2,3,4].map(() => `CMD: Gen Photo. SUBJECT: ${project.productName}. STYLE: ${styleContext}`);
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
    const prompt = `
        Role: TikTok Strategist. Prod: ${project.productName}. Hook: ${angle}.
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
