

export enum NodeType {
  ROOT = 'ROOT',
  PERSONA = 'PERSONA',
  ANGLE = 'ANGLE',
  CREATIVE = 'CREATIVE'
}

export enum CreativeFormat {
  // --- CAROUSEL SPECIALS (NEW) ---
  CAROUSEL_EDUCATIONAL = 'Carousel: Educational / Tips',
  CAROUSEL_TESTIMONIAL = 'Carousel: Testimonial Pile',
  CAROUSEL_PANORAMA = 'Carousel: Seamless Panorama',
  CAROUSEL_PHOTO_DUMP = 'Carousel: Photo Dump / Recap',
  CAROUSEL_REAL_STORY = 'Carousel: Real People Story (UGC)', // NEW

  // Previous Performers
  BIG_FONT = 'Big Font / Text Heavy',
  GMAIL_UX = 'Gmail / Letter Style',
  BILLBOARD = 'Billboard Ad',
  UGLY_VISUAL = 'Ugly Visual / Problem Focus',
  MS_PAINT = 'MS Paint / Nostalgia',
  REDDIT_THREAD = 'Reddit Thread',
  MEME = 'Meme / Internet Culture',
  LONG_TEXT = 'Long Text / Story',
  CARTOON = 'Cartoon / Illustration',
  BEFORE_AFTER = 'Before & After',
  WHITEBOARD = 'Whiteboard / Diagram',

  // Instagram Native
  TWITTER_REPOST = 'Twitter/X Repost',
  PHONE_NOTES = 'iPhone Notes App',
  AESTHETIC_MINIMAL = 'Aesthetic / Text Overlay',
  STORY_POLL = 'Story: Standard Poll (Yes/No)',
  STORY_QNA = 'Story: Ask Me Anything (Influencer Style)', 
  REELS_THUMBNAIL = 'Reels Cover / Fake Video',
  DM_NOTIFICATION = 'DM Notification',
  UGC_MIRROR = 'UGC Mirror Selfie',

  // New: Logical & Comparison
  US_VS_THEM = 'Us vs Them / Comparison Table',
  GRAPH_CHART = 'Graph / Data Visualization',
  TIMELINE_JOURNEY = 'Timeline / Roadmap',

  // New: Voyeurism & Social
  CHAT_CONVERSATION = 'Chat Bubble / WhatsApp',
  REMINDER_NOTIF = 'Lockscreen Reminder',
  SOCIAL_COMMENT_STACK = 'Social Comment Stack', 
  HANDHELD_TWEET = 'Handheld Tweet Overlay',     

  // New: Product Centric
  POV_HANDS = 'POV / Hands-on',
  ANNOTATED_PRODUCT = 'Annotated / Feature Breakdown',
  SEARCH_BAR = 'Search Bar UI',
  BENEFIT_POINTERS = 'Benefit Pointers / Anatomy', 

  // New: Aesthetic & Mood
  COLLAGE_SCRAPBOOK = 'Collage / Scrapbook',
  CHECKLIST_TODO = 'Checklist / To-Do',
  STICKY_NOTE_REALISM = 'Sticky Note / Handwritten' 
}

export enum CampaignStage {
  TESTING = 'TESTING', // CBO - High Volume Bid Strategy
  SCALING = 'SCALING'  // Advantage+ / Broad - Cost Cap/ROAS Goal
}

// NEW: Marketing Funnel Stages
export enum FunnelStage {
  TOF = 'Top of Funnel (Cold Awareness)',
  MOF = 'Middle of Funnel (Consideration)',
  BOF = 'Bottom of Funnel (Retargeting/Conversion)'
}

// NEW: Eugene Schwartz Market Awareness Levels
export enum MarketAwareness {
  UNAWARE = 'Unaware (No knowledge of problem)',
  PROBLEM_AWARE = 'Problem Aware (Knows problem, seeks solution)',
  SOLUTION_AWARE = 'Solution Aware (Knows solutions, comparing options)',
  PRODUCT_AWARE = 'Product Aware (Knows you, needs a deal)',
  MOST_AWARE = 'Most Aware (Ready to buy, needs urgency)'
}

// NEW: Direct Response Frameworks
export enum CopyFramework {
  PAS = 'PAS (Problem, Agitation, Solution)',
  AIDA = 'AIDA (Attention, Interest, Desire, Action)',
  BAB = 'BAB (Before, After, Bridge)',
  FAB = 'FAB (Features, Advantages, Benefits)',
  STORY = 'Storytelling / Hero\'s Journey'
}

export type ViewMode = 'LAB' | 'VAULT';

export interface Metrics {
  spend: number;
  cpa: number;
  roas: number;
  impressions: number;
  ctr: number;
}

export interface AdCopy {
  primaryText: string;
  headline: string;
  cta: string;
  complianceNotes?: string; // New field for safety checks
}

export interface NodeData {
  id: string;
  type: NodeType;
  parentId?: string | null;
  
  // Content
  title: string;
  description?: string;
  meta?: Record<string, any>;
  
  // Creative specific
  imageUrl?: string; // The "Cover" image
  carouselImages?: string[]; // NEW: Array of additional slides
  format?: CreativeFormat;
  adCopy?: AdCopy; // New: AI Copywriting
  
  // Audio / Scripting (New Improvement)
  audioScript?: string;
  audioBase64?: string; // Raw PCM data base64 encoded
  
  // State
  isLoading?: boolean;
  stage?: CampaignStage; // Track if it's in Lab or Vault
  isGhost?: boolean; // New: Trace left behind in Lab
  
  // Performance Data (The Andromeda Metric System)
  metrics?: Metrics;
  postId?: string; // Simulating the "Existing Post ID" retention
  isWinning?: boolean; 
  isLosing?: boolean;
  aiInsight?: string; // New: Strategic Analysis
  
  // Usage & Cost Tracking (NEW)
  inputTokens?: number;
  outputTokens?: number;
  estimatedCost?: number;

  // Layout
  x: number;
  y: number;
}

export interface Edge {
  id: string;
  source: string;
  target: string;
}

export interface ProjectContext {
  productName: string;
  productDescription: string;
  targetAudience: string;
  landingPageUrl?: string; // Added for Firecrawl analysis
  productReferenceImage?: string; // NEW: Optional Product Reference Image (Base64)
  
  // New Strategic Inputs
  targetCountry?: string; // e.g. "Indonesia", "USA", "Brazil"
  brandVoice?: string; // e.g. "Witty", "Medical", "Gen-Z"
  funnelStage?: FunnelStage;
  
  // NEW: Deep Strategy Inputs
  offer?: string; // e.g. "50% Off First Order", "Free Shipping", "30 Day Guarantee"
  marketAwareness?: MarketAwareness;
  copyFramework?: CopyFramework;
}

// Internal Interface for the "Strategist Agent"
export interface CreativeConcept {
  visualScene: string;   // Description for the Visualizer
  visualStyle: string;   // NEW: Art Direction (Lighting, Vibe, Texture)
  technicalPrompt: string; // NEW: Technical Camera Specs (Keywords)
  copyAngle: string;     // Direction for the Copywriter
  rationale: string;
}

export interface GenResult<T> {
  data: T;
  inputTokens: number;
  outputTokens: number;
}