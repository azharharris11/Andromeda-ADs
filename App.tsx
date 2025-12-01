
import React, { useState, useRef } from 'react';
import { HashRouter } from 'react-router-dom';
import { Layers, Settings, Activity, Microscope, ShieldCheck, X, RefreshCw, Globe, Sparkles, Image as ImageIcon, Upload, Package } from 'lucide-react';
import Canvas, { CanvasHandle } from './components/Canvas';
import Node from './components/Node';
import Inspector from './components/Inspector';
import { NodeType, NodeData, Edge, ProjectContext, CreativeFormat, CampaignStage, ViewMode } from './types';
import { generatePersonas, generateAngles, generateCreativeImage, generateAdCopy, generateCarouselSlides, generateVisualStyle, analyzeLandingPageContext, analyzeImageContext } from './services/geminiService';
import { scrapeLandingPage } from './services/firecrawlService';

const INITIAL_PROJECT: ProjectContext = {
  productName: "Zenith Focus Gummies",
  productDescription: "Nootropic gummies for focus and memory without the caffeine crash.",
  targetAudience: "Students, Programmers, and Creatives."
};

const FORMAT_GROUPS: Record<string, CreativeFormat[]> = {
  "Carousel Specials (High Engagement)": [
    CreativeFormat.CAROUSEL_EDUCATIONAL,
    CreativeFormat.CAROUSEL_TESTIMONIAL,
    CreativeFormat.CAROUSEL_PANORAMA,
    CreativeFormat.CAROUSEL_PHOTO_DUMP,
  ],
  "Instagram Native": [
    CreativeFormat.TWITTER_REPOST,
    CreativeFormat.STORY_POLL,
    CreativeFormat.REELS_THUMBNAIL,
    CreativeFormat.DM_NOTIFICATION,
    CreativeFormat.UGC_MIRROR,
    CreativeFormat.PHONE_NOTES,
  ],
  "Logic & Rational": [
    CreativeFormat.US_VS_THEM,
    CreativeFormat.GRAPH_CHART,
    CreativeFormat.TIMELINE_JOURNEY,
  ],
  "Social Proof & Voyeurism": [
    CreativeFormat.CHAT_CONVERSATION,
    CreativeFormat.REMINDER_NOTIF,
  ],
  "Product Centric": [
    CreativeFormat.POV_HANDS,
    CreativeFormat.ANNOTATED_PRODUCT,
    CreativeFormat.SEARCH_BAR,
  ],
  "Aesthetic & Mood": [
    CreativeFormat.COLLAGE_SCRAPBOOK,
    CreativeFormat.CHECKLIST_TODO,
    CreativeFormat.AESTHETIC_MINIMAL,
  ],
  "Pattern Interrupts": [
    CreativeFormat.BIG_FONT,
    CreativeFormat.GMAIL_UX,
    CreativeFormat.UGLY_VISUAL,
    CreativeFormat.MS_PAINT,
    CreativeFormat.MEME,
    CreativeFormat.LONG_TEXT,
    CreativeFormat.BEFORE_AFTER,
    CreativeFormat.CARTOON,
    CreativeFormat.WHITEBOARD,
    CreativeFormat.REDDIT_THREAD
  ]
};

const App = () => {
  const [project, setProject] = useState<ProjectContext>(INITIAL_PROJECT);
  const [activeView, setActiveView] = useState<ViewMode>('LAB');
  
  const [nodes, setNodes] = useState<NodeData[]>([
    {
      id: 'root',
      type: NodeType.ROOT,
      title: INITIAL_PROJECT.productName,
      description: INITIAL_PROJECT.productDescription,
      x: 0,
      y: 0,
      stage: CampaignStage.TESTING
    }
  ]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [isConfigOpen, setIsConfigOpen] = useState(true);
  const [simulating, setSimulating] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [isFormatModalOpen, setIsFormatModalOpen] = useState(false);
  const [targetAngleId, setTargetAngleId] = useState<string | null>(null);
  const [selectedFormats, setSelectedFormats] = useState<Set<CreativeFormat>>(new Set());
  
  // New States for Firecrawl & Image Analysis
  const [landingPageUrl, setLandingPageUrl] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isAnalyzingImage, setIsAnalyzingImage] = useState(false);
  
  const canvasRef = useRef<CanvasHandle>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const productRefInputRef = useRef<HTMLInputElement>(null);

  const labNodes = nodes.filter(n => n.stage === CampaignStage.TESTING || n.isGhost);
  const labEdges = edges.filter(e => {
      const source = nodes.find(n => n.id === e.source);
      const target = nodes.find(n => n.id === e.target);
      return (source?.stage === CampaignStage.TESTING || source?.isGhost) && 
             (target?.stage === CampaignStage.TESTING || target?.isGhost);
  });
  const vaultNodes = nodes.filter(n => n.stage === CampaignStage.SCALING);
  const selectedNode = nodes.find(n => n.id === selectedNodeId);

  const addNode = (node: NodeData) => { setNodes(prev => [...prev, node]); };
  const addEdge = (source: string, target: string) => { setEdges(prev => [...prev, { id: `${source}-${target}`, source, target }]); };
  const updateNode = (id: string, updates: Partial<NodeData>) => { setNodes(prev => prev.map(n => n.id === id ? { ...n, ...updates } : n)); };

  // --- FIRECRAWL ANALYSIS ---
  const handleAnalyzeUrl = async () => {
      if (!landingPageUrl) return;
      
      setIsAnalyzing(true);
      try {
          // 1. Scrape with Firecrawl
          const scrapeResult = await scrapeLandingPage(landingPageUrl);
          
          if (!scrapeResult.success || !scrapeResult.markdown) {
              alert("Failed to read the website. Please enter details manually.");
              setIsAnalyzing(false);
              return;
          }

          // 2. Analyze with Gemini
          const context = await analyzeLandingPageContext(scrapeResult.markdown);
          
          setProject({
              ...project,
              productName: context.productName,
              productDescription: context.productDescription,
              targetAudience: context.targetAudience,
              landingPageUrl: landingPageUrl
          });

          // Update Root Node
          setNodes(prev => prev.map(n => n.type === NodeType.ROOT ? {
              ...n,
              title: context.productName,
              description: context.productDescription
          } : n));

      } catch (e) {
          console.error(e);
          alert("Analysis failed. Please check the URL and try again.");
      }
      setIsAnalyzing(false);
  };

  // --- IMAGE ANALYSIS ---
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setIsAnalyzingImage(true);
      
      const reader = new FileReader();
      reader.onloadend = async () => {
          const base64 = reader.result as string;
          try {
              const context = await analyzeImageContext(base64);
              
              setProject({
                  ...project, // Keep url if exists
                  productName: context.productName,
                  productDescription: context.productDescription,
                  targetAudience: context.targetAudience
              });

               // Update Root Node
              setNodes(prev => prev.map(n => n.type === NodeType.ROOT ? {
                  ...n,
                  title: context.productName,
                  description: context.productDescription
              } : n));

          } catch (error) {
              console.error(error);
              alert("Could not analyze image. Try a clearer product shot.");
          }
          setIsAnalyzingImage(false);
      };
      reader.readAsDataURL(file);
  };

  // --- PRODUCT REFERENCE IMAGE ---
  const handleProductRefUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onloadend = () => {
          const base64 = reader.result as string;
          setProject(prev => ({ ...prev, productReferenceImage: base64 }));
      };
      reader.readAsDataURL(file);
  };

  // New: Handle Regeneration from Inspector
  const handleRegenerateNode = async (nodeId: string, aspectRatio: string) => {
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return;

    updateNode(nodeId, { isLoading: true, description: "Regenerating visual..." });

    try {
        const personaName = node.meta?.personaName || "User";
        const angle = node.meta?.angle || node.title;
        const styleContext = node.meta?.styleContext || "";
        const format = node.format as CreativeFormat;

        const imgResult = await generateCreativeImage(project, personaName, angle, format, styleContext, aspectRatio);
        
        if (imgResult.data) {
            updateNode(nodeId, { 
                imageUrl: imgResult.data,
                isLoading: false,
                description: node.adCopy?.primaryText.slice(0, 100) + "..." || node.description
            });
        } else {
            updateNode(nodeId, { isLoading: false, description: "Regeneration failed." });
        }
    } catch (e) {
        console.error("Regeneration failed", e);
        updateNode(nodeId, { isLoading: false, description: "Error during regeneration" });
    }
  };

  const executeGeneration = async (nodeId: string, formats: CreativeFormat[]) => {
    const parentNode = nodes.find(n => n.id === nodeId);
    if (!parentNode) return;

    updateNode(nodeId, { isLoading: true });

    // Grid Layout Constants
    const HORIZONTAL_GAP = 550; 
    const COL_SPACING = 350;    
    const ROW_SPACING = 400;    
    const COLUMNS = 3;

    const totalRows = Math.ceil(formats.length / COLUMNS);
    const totalBlockHeight = (totalRows - 1) * ROW_SPACING;
    const startY = parentNode.y - (totalBlockHeight / 2);

    const newNodes: NodeData[] = [];
    
    formats.forEach((format, index) => {
      const row = Math.floor(index / COLUMNS);
      const col = index % COLUMNS;
      
      const newId = `creative-${Date.now()}-${index}`;
      const nodeData: NodeData = {
        id: newId, 
        type: NodeType.CREATIVE, 
        parentId: nodeId,
        title: format, 
        description: "Initializing Generation...", 
        format: format,
        isLoading: true, 
        x: parentNode.x + HORIZONTAL_GAP + (col * COL_SPACING), 
        y: startY + (row * ROW_SPACING),
        stage: CampaignStage.TESTING,
        meta: { 
            personaName: parentNode.meta?.personaName,
            angle: parentNode.title, // Critical: Pass angle to child for context
            styleContext: "" 
        }
      };
      newNodes.push(nodeData);
      addNode(nodeData);
      addEdge(nodeId, newId);
    });

    // GENERATION PROCESS
    for (const node of newNodes) {
        if (newNodes.indexOf(node) > 0) await new Promise(resolve => setTimeout(resolve, 1500));

        try {
            const personaName = parentNode.meta?.personaName || "User";
            const angle = parentNode.title;
            const fmt = node.format as CreativeFormat;
            
            let accumulatedInput = 0;
            let accumulatedOutput = 0;
            let imageCount = 0;

            const isCarousel = (
                fmt === CreativeFormat.CAROUSEL_EDUCATIONAL ||
                fmt === CreativeFormat.CAROUSEL_TESTIMONIAL ||
                fmt === CreativeFormat.CAROUSEL_PANORAMA ||
                fmt === CreativeFormat.CAROUSEL_PHOTO_DUMP
            );

            // 1. Creative Director: Define Style Context
            // ONLY run "Creative Director" (Style Gen) for Carousels to ensure cohesion.
            // For Single Images, we SKIP this and pass an empty style to avoid contamination.
            let visualStyle = "";
            
            if (isCarousel) {
                updateNode(node.id, { description: "Director: Setting Scene..." });
                const styleResult = await generateVisualStyle(project, personaName, angle);
                accumulatedInput += styleResult.inputTokens;
                accumulatedOutput += styleResult.outputTokens;
                visualStyle = styleResult.data;
            } else {
                updateNode(node.id, { description: "Format: Enforcing Medium..." });
                // We intentionally leave visualStyle empty.
                // geminiService.ts will now enforce the MEDIUM based purely on FORMAT.
            }

            // 2. Copywriter: Generate Text
            updateNode(node.id, { description: "Copywriter: Drafting..." });
            const copyResult = await generateAdCopy(project, personaName, angle);
            accumulatedInput += copyResult.inputTokens;
            accumulatedOutput += copyResult.outputTokens;
            const adCopy = copyResult.data;

            // 3. Visualizer: Generate Main Image
            updateNode(node.id, { description: "Visualizer: Rendering..." });
            const imgResult = await generateCreativeImage(project, personaName, angle, fmt, visualStyle, "1:1");
            accumulatedInput += imgResult.inputTokens;
            accumulatedOutput += imgResult.outputTokens;
            const imageUrl = imgResult.data;
            if (imageUrl) imageCount++;

            // 4. Carousel Handler
            let carouselImages: string[] = [];
            if (isCarousel) {
                const slidesResult = await generateCarouselSlides(project, fmt, angle, visualStyle);
                accumulatedInput += slidesResult.inputTokens;
                accumulatedOutput += slidesResult.outputTokens;
                carouselImages = slidesResult.data;
                imageCount += carouselImages.length;
            }

            // COST CALCULATION (Gemini 2.5 Flash Pricing)
            const inputCost = (accumulatedInput / 1000000) * 0.30;
            const outputCost = (accumulatedOutput / 1000000) * 2.50;
            const imgCost = imageCount * 0.039;
            const totalCost = inputCost + outputCost + imgCost;

            updateNode(node.id, { 
                isLoading: false, 
                description: adCopy.primaryText.slice(0, 100) + "...",
                imageUrl: imageUrl || undefined,
                carouselImages: carouselImages.length > 0 ? carouselImages : undefined,
                adCopy: adCopy,
                inputTokens: accumulatedInput,
                outputTokens: accumulatedOutput,
                estimatedCost: totalCost,
                meta: { ...node.meta, styleContext: visualStyle } // Save style context for regeneration
            });
        } catch (e) {
            console.error("Error generating creative node", e);
            updateNode(node.id, { isLoading: false, description: "Generation Failed" });
        }
    }
    updateNode(nodeId, { isLoading: false });
  };

  const handleNodeAction = async (action: string, nodeId: string) => {
    const parentNode = nodes.find(n => n.id === nodeId);
    if (!parentNode) return;

    if (action === 'expand_personas') {
      updateNode(nodeId, { isLoading: true });
      try {
          const result = await generatePersonas(project);
          const personas = result.data;
          
          const HORIZONTAL_GAP = 600;
          const VERTICAL_SPACING = 800;
          const totalHeight = (personas.length - 1) * VERTICAL_SPACING;
          const startY = parentNode.y - (totalHeight / 2);
          
          personas.forEach((p: any, index: number) => {
            const newNodeId = `persona-${Date.now()}-${index}`;
            addNode({
              id: newNodeId, type: NodeType.PERSONA, parentId: nodeId,
              title: p.name, description: `${p.motivation}`,
              x: parentNode.x + HORIZONTAL_GAP, y: startY + (index * VERTICAL_SPACING),
              meta: p, stage: CampaignStage.TESTING,
              inputTokens: result.inputTokens / 3, // rough split
              outputTokens: result.outputTokens / 3,
              estimatedCost: ((result.inputTokens/1000000)*0.3 + (result.outputTokens/1000000)*2.5) / 3
            });
            addEdge(nodeId, newNodeId);
          });
      } catch (e) { alert("Quota exceeded."); }
      updateNode(nodeId, { isLoading: false });
    }

    if (action === 'expand_angles') {
      updateNode(nodeId, { isLoading: true });
      try {
          const pMeta = parentNode.meta || {};
          const result = await generateAngles(project, pMeta.name, pMeta.motivation);
          const angles = result.data;
          
          const HORIZONTAL_GAP = 550;
          const VERTICAL_SPACING = 350;
          const totalHeight = (angles.length - 1) * VERTICAL_SPACING;
          const startY = parentNode.y - (totalHeight / 2);

          angles.forEach((a: any, index: number) => {
            const newNodeId = `angle-${Date.now()}-${index}`;
            addNode({
              id: newNodeId, type: NodeType.ANGLE, parentId: nodeId,
              title: a.headline, description: `Hook: ${a.painPoint}`,
              x: parentNode.x + HORIZONTAL_GAP, y: startY + (index * VERTICAL_SPACING),
              meta: { ...a, personaName: pMeta.name }, stage: CampaignStage.TESTING,
              inputTokens: result.inputTokens / 3,
              outputTokens: result.outputTokens / 3,
              estimatedCost: ((result.inputTokens/1000000)*0.3 + (result.outputTokens/1000000)*2.5) / 3
            });
            addEdge(nodeId, newNodeId);
          });
      } catch (e) { console.error("Angle gen failed", e); }
      updateNode(nodeId, { isLoading: false });
    }

    if (action === 'generate_creatives') {
      setTargetAngleId(nodeId);
      setIsFormatModalOpen(true);
      setSelectedFormats(new Set());
    }

    if (action === 'promote_creative') {
        const originalNode = nodes.find(n => n.id === nodeId);
        if (!originalNode) return;
        updateNode(nodeId, { isGhost: true, stage: CampaignStage.TESTING });
        const vaultNodeId = `vault-${nodeId}`;
        const vaultNode: NodeData = {
            ...originalNode,
            id: vaultNodeId,
            stage: CampaignStage.SCALING,
            description: "Active in Advantage+ Scaling Campaign",
            postId: `PID-${Math.floor(Math.random() * 1000000)}`,
            x: 0, y: 0, 
            isWinning: true,
            metrics: { spend: 850, cpa: 12.5, roas: 3.2, impressions: 45000, ctr: 1.8 }
        };
        addNode(vaultNode);
    }

    if (action === 'remix_creative') {
        const sourceNode = nodes.find(n => n.id === nodeId);
        if (!sourceNode) return;
        updateNode(nodeId, { isLoading: true }); // Loading on the button

        // -------------------------
        // REMIX STRATEGY
        // 1. Copy Variation (Same Visual, New Copy)
        // 2. Visual Variation (Same Copy, New Visual Style)
        // 3. Format Pivot (Completely new Format)
        // -------------------------

        const personaName = sourceNode.meta?.personaName || "User";
        const angle = sourceNode.meta?.angle || sourceNode.title; // Fallback
        const currentFormat = sourceNode.format as CreativeFormat;
        const currentStyle = sourceNode.meta?.styleContext || "";

        // Determine a pivot format (something different)
        const pivotOptions = [CreativeFormat.UGLY_VISUAL, CreativeFormat.TWITTER_REPOST, CreativeFormat.AESTHETIC_MINIMAL, CreativeFormat.POV_HANDS];
        const pivotFormat = pivotOptions.find(f => f !== currentFormat) || CreativeFormat.AESTHETIC_MINIMAL;

        const variations = [
            { idSuffix: 'v-copy', label: 'Copy Remix', type: 'COPY', format: currentFormat },
            { idSuffix: 'v-visual', label: 'Visual Refresh', type: 'VISUAL', format: currentFormat },
            { idSuffix: 'v-format', label: 'Format Pivot', type: 'FORMAT', format: pivotFormat }
        ];

        const startX = sourceNode.x + 400;
        const startY = sourceNode.y;
        
        // Create skeleton nodes first
        const remixNodes: NodeData[] = variations.map((v, i) => ({
            id: `remix-${sourceNode.id}-${v.idSuffix}`,
            type: NodeType.CREATIVE,
            parentId: sourceNode.id,
            title: v.format,
            description: `Remixing: ${v.label}...`,
            format: v.format,
            x: startX,
            y: startY + ((i - 1) * 400),
            stage: CampaignStage.TESTING,
            isLoading: true,
            meta: { personaName, angle, styleContext: currentStyle }
        }));
        
        remixNodes.forEach(n => { addNode(n); addEdge(sourceNode.id, n.id); });

        // Process Remixes
        for (let i = 0; i < variations.length; i++) {
            const v = variations[i];
            const node = remixNodes[i];
            
            try {
                let accumulatedInput = 0;
                let accumulatedOutput = 0;
                let imageCount = 0;
                
                // --- STEP 1: VISUAL STYLE ---
                let visualStyle = currentStyle;
                if (v.type === 'VISUAL') {
                    // Force a new style generation for Visual Refresh
                     const styleResult = await generateVisualStyle(project, personaName, angle);
                     visualStyle = styleResult.data;
                     accumulatedInput += styleResult.inputTokens; accumulatedOutput += styleResult.outputTokens;
                }
                
                // --- STEP 2: COPY ---
                let adCopy = sourceNode.adCopy;
                if (v.type === 'COPY' || !adCopy) {
                    const copyResult = await generateAdCopy(project, personaName, angle);
                    adCopy = copyResult.data;
                    accumulatedInput += copyResult.inputTokens; accumulatedOutput += copyResult.outputTokens;
                }

                // --- STEP 3: VISUALS ---
                // For Copy Remix, ideally keep image, but API doesn't support "reuse image id" easily without persistent storage.
                // So we regenerate with SAME parameters.
                // For Visual Remix, we use NEW style.
                // For Format Pivot, we use NEW format.
                
                const imgResult = await generateCreativeImage(project, personaName, angle, v.format, visualStyle, "1:1");
                const imageUrl = imgResult.data;
                if (imageUrl) imageCount++;
                accumulatedInput += imgResult.inputTokens; accumulatedOutput += imgResult.outputTokens;

                // --- COST ---
                const totalCost = (accumulatedInput / 1e6 * 0.3) + (accumulatedOutput / 1e6 * 2.5) + (imageCount * 0.039);

                updateNode(node.id, {
                    isLoading: false,
                    imageUrl: imageUrl || undefined,
                    adCopy: adCopy,
                    description: adCopy?.primaryText.slice(0, 100) + "...",
                    inputTokens: accumulatedInput,
                    outputTokens: accumulatedOutput,
                    estimatedCost: totalCost,
                    meta: { ...node.meta, styleContext: visualStyle }
                });

            } catch (e) {
                console.error("Remix failed", e);
                updateNode(node.id, { isLoading: false, description: "Remix Failed" });
            }
        }
        
        updateNode(nodeId, { isLoading: false });
    }
  };

  const handleSimulatePerformance = () => {
    setSimulating(true);
    setTimeout(() => {
      setNodes(prev => prev.map(n => {
        if (n.type === NodeType.CREATIVE && !n.isLoading && n.stage === CampaignStage.TESTING && !n.isGhost) {
          const spend = Math.floor(Math.random() * 1500) + 20;
          let cpa = 0, roas = 0;
          if (spend > 500) {
             const quality = Math.random();
             if (quality > 0.6) { roas = 2.5 + Math.random() * 3; cpa = 10 + Math.random() * 15; } 
             else { roas = 0.5 + Math.random(); cpa = 50 + Math.random() * 50; }
          } else { roas = Math.random() * 2; cpa = 20 + Math.random() * 30; }
          const isWinning = spend > 400 && roas > 2.2;
          const isLosing = spend > 300 && roas < 1.5;
          return { ...n, metrics: { spend, cpa, roas, impressions: Math.floor(spend * 60), ctr: 0.5 + Math.random() * 2 }, isWinning, isLosing };
        }
        return n;
      }));
      setSimulating(false);
    }, 1200);
  };

  const toggleFormat = (fmt: CreativeFormat) => {
    const next = new Set(selectedFormats);
    if (next.has(fmt)) next.delete(fmt);
    else next.add(fmt);
    setSelectedFormats(next);
  };

  const handleConfirmGeneration = () => {
      if (targetAngleId && selectedFormats.size > 0) {
          executeGeneration(targetAngleId, Array.from(selectedFormats));
          setIsFormatModalOpen(false);
          setTargetAngleId(null);
          setSelectedFormats(new Set());
      }
  };

  const selectAll = () => {
      const all: CreativeFormat[] = [];
      Object.values(FORMAT_GROUPS).forEach(group => all.push(...group));
      setSelectedFormats(new Set(all));
  };

  return (
    <HashRouter>
      <div className="relative w-full h-screen flex flex-col bg-slate-50 text-slate-900 overflow-hidden font-sans">
        <header className="absolute top-0 w-full z-50 p-6 flex justify-center pointer-events-none">
            <div className="glass-panel rounded-2xl px-2 py-2 flex items-center gap-4 shadow-xl shadow-slate-200/50 pointer-events-auto">
                <div className="flex items-center gap-3 px-4">
                    <div className="w-8 h-8 bg-slate-900 rounded-lg flex items-center justify-center shadow-lg shadow-slate-900/20">
                        <Layers className="text-white w-4 h-4" />
                    </div>
                    <h1 className="font-display font-bold text-lg tracking-tight text-slate-900 hidden md:block">Andromeda</h1>
                </div>
                <div className="h-8 w-px bg-slate-200"></div>
                <div className="flex bg-slate-100/50 p-1 rounded-xl">
                    <button onClick={() => setActiveView('LAB')} className={`flex items-center gap-2 px-6 py-2 rounded-lg text-sm font-bold transition-all ${activeView === 'LAB' ? 'bg-white shadow-sm text-blue-600 ring-1 ring-slate-200' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'}`}>
                        <Microscope className="w-4 h-4" /> LAB
                    </button>
                    <button onClick={() => setActiveView('VAULT')} className={`flex items-center gap-2 px-6 py-2 rounded-lg text-sm font-bold transition-all ${activeView === 'VAULT' ? 'bg-amber-400 shadow-md shadow-amber-200 text-amber-950' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'}`}>
                        <ShieldCheck className="w-4 h-4" /> VAULT
                        {vaultNodes.length > 0 && (<span className="bg-amber-950/10 text-amber-900 px-1.5 rounded text-[10px] min-w-[20px] text-center">{vaultNodes.length}</span>)}
                    </button>
                </div>
                <div className="h-8 w-px bg-slate-200"></div>
                <div className="flex items-center gap-2">
                    <button onClick={handleSimulatePerformance} disabled={simulating} className="flex items-center gap-2 px-4 py-2 bg-white hover:bg-slate-50 rounded-xl text-xs font-bold text-slate-700 transition-all border border-slate-200 hover:border-blue-300 shadow-sm">
                    <Activity className={`w-3 h-3 ${simulating ? 'animate-spin text-blue-500' : 'text-emerald-500'}`} />
                    <span className="hidden md:inline">SIMULATE</span>
                    </button>
                    <button onClick={() => setIsConfigOpen(true)} className="p-2.5 hover:bg-slate-100 rounded-xl transition-colors text-slate-400 hover:text-slate-900"><Settings className="w-4 h-4" /></button>
                </div>
            </div>
        </header>

        <main className="flex-1 relative mt-0 flex">
          <div className={`flex-1 relative transition-all duration-500 ${selectedNode ? 'mr-[400px]' : 'mr-0'}`}>
            <div className={`absolute inset-0 transition-opacity duration-300 ${activeView === 'LAB' ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'}`}>
                <Canvas ref={canvasRef} nodes={labNodes} edges={labEdges} onNodeAction={handleNodeAction} selectedNodeId={selectedNodeId} onSelectNode={setSelectedNodeId} />
            </div>
            <div className={`absolute inset-0 bg-[#FFFBEB] overflow-y-auto transition-opacity duration-300 ${activeView === 'VAULT' ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'}`}>
                <div className="max-w-7xl mx-auto px-8 pt-32 pb-12">
                    {/* Vault View Content */}
                    <div className="flex flex-col items-center mb-12">
                        <ShieldCheck className="w-16 h-16 text-amber-500 mb-4" strokeWidth={1} />
                        <h2 className="text-4xl font-display font-bold text-amber-900">The Vault</h2>
                        <p className="text-amber-800/60 mt-2">Scale your winning assets.</p>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                         {vaultNodes.map(node => (<div key={node.id} className="h-[400px]"><Node data={node} selected={selectedNodeId === node.id} onClick={() => setSelectedNodeId(node.id)} onAction={handleNodeAction} isGridView={true} /></div>))}
                    </div>
                </div>
            </div>
          </div>
          <div className={`fixed top-0 right-0 bottom-0 w-[400px] z-40 transform transition-transform duration-500 ease-in-out ${selectedNode ? 'translate-x-0' : 'translate-x-full'}`}>
            {selectedNode && <Inspector node={selectedNode} onClose={() => setSelectedNodeId(null)} onUpdate={updateNode} onRegenerate={handleRegenerateNode} project={project} />}
          </div>
          
          {isConfigOpen && (
             <div className="absolute top-24 left-1/2 -translate-x-1/2 w-[480px] glass-panel rounded-2xl p-6 z-50 animate-in fade-in slide-in-from-top-4 duration-300">
                 <div className="flex justify-between items-center mb-6">
                    <div className="flex items-center gap-2">
                         <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white"><Sparkles className="w-4 h-4"/></div>
                         <h2 className="font-bold text-lg font-display">New Project</h2>
                    </div>
                    <button onClick={() => setIsConfigOpen(false)} className="text-slate-400 hover:text-slate-800"><X className="w-5 h-5" /></button>
                 </div>

                 {/* URL ANALYZER (Firecrawl) */}
                 <div className="mb-4 p-4 bg-blue-50/50 border border-blue-100 rounded-xl">
                    <label className="text-xs font-bold text-blue-900 uppercase tracking-wide mb-2 block">Import from URL (Firecrawl)</label>
                    <div className="flex gap-2">
                        <div className="relative flex-1">
                            <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <input 
                                className="w-full pl-9 pr-3 py-2 bg-white border border-blue-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none" 
                                placeholder="https://your-landing-page.com"
                                value={landingPageUrl}
                                onChange={(e) => setLandingPageUrl(e.target.value)}
                            />
                        </div>
                        <button 
                            onClick={handleAnalyzeUrl}
                            disabled={isAnalyzing || !landingPageUrl}
                            className="px-4 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-lg disabled:opacity-50 flex items-center gap-2 transition-colors"
                        >
                            {isAnalyzing ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : "Analyze"}
                        </button>
                    </div>
                 </div>

                 {/* IMAGE ANALYZER (Gemini Vision) */}
                 <div className="mb-4 p-4 bg-indigo-50/50 border border-indigo-100 rounded-xl">
                     <label className="text-xs font-bold text-indigo-900 uppercase tracking-wide mb-2 block">Import from Image (Ad/Product)</label>
                     <div className="flex items-center justify-between">
                         <div className="text-[10px] text-indigo-700/60 max-w-[200px]">
                            Upload a product shot or existing ad. AI will reverse-engineer the strategy.
                         </div>
                         <button 
                            onClick={() => fileInputRef.current?.click()}
                            disabled={isAnalyzingImage}
                            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-lg disabled:opacity-50 flex items-center gap-2 transition-colors"
                         >
                            <input 
                                type="file" 
                                ref={fileInputRef} 
                                onChange={handleImageUpload} 
                                className="hidden" 
                                accept="image/*"
                            />
                            {isAnalyzingImage ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : <><Upload className="w-3 h-3"/> Upload</>}
                         </button>
                     </div>
                 </div>

                 {/* PRODUCT REFERENCE IMAGE (For Generation) */}
                 <div className="mb-6 p-4 bg-emerald-50/50 border border-emerald-100 rounded-xl">
                     <label className="text-xs font-bold text-emerald-900 uppercase tracking-wide mb-2 block">Product Reference Photo (Optional)</label>
                     <div className="flex items-center justify-between">
                         <div className="text-[10px] text-emerald-700/60 max-w-[200px]">
                            Upload a clean product shot. Andromeda will try to use this in generated ads.
                         </div>
                         <button 
                            onClick={() => productRefInputRef.current?.click()}
                            className={`px-4 py-2 text-sm font-bold rounded-lg flex items-center gap-2 transition-colors ${project.productReferenceImage ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' : 'bg-emerald-600 hover:bg-emerald-700 text-white'}`}
                         >
                            <input 
                                type="file" 
                                ref={productRefInputRef} 
                                onChange={handleProductRefUpload} 
                                className="hidden" 
                                accept="image/*"
                            />
                            {project.productReferenceImage ? <><Package className="w-3 h-3"/> Uploaded</> : <><Upload className="w-3 h-3"/> Upload</>}
                         </button>
                     </div>
                 </div>
                 
                 <div className="relative flex items-center py-2 mb-2">
                     <div className="flex-grow border-t border-slate-200"></div>
                     <span className="flex-shrink-0 mx-4 text-slate-400 text-xs font-bold uppercase">Or Manual Entry</span>
                     <div className="flex-grow border-t border-slate-200"></div>
                 </div>

                 <div className="space-y-4">
                     <div>
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1 block">Product Name</label>
                        <input className="w-full p-2.5 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-slate-900 outline-none" value={project.productName} onChange={e => setProject({...project, productName: e.target.value})} placeholder="e.g. Zenith Focus Gummies"/>
                     </div>
                     <div>
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1 block">Description</label>
                        <textarea className="w-full p-2.5 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-slate-900 outline-none min-h-[80px]" value={project.productDescription} onChange={e => setProject({...project, productDescription: e.target.value})} placeholder="What does it do? What is the main benefit?"/>
                     </div>
                     <div>
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1 block">Target Audience</label>
                        <input className="w-full p-2.5 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-slate-900 outline-none" value={project.targetAudience} onChange={e => setProject({...project, targetAudience: e.target.value})} placeholder="e.g. Students, Gamers, Professionals"/>
                     </div>
                     <button onClick={() => setIsConfigOpen(false)} className="w-full bg-slate-900 hover:bg-black text-white py-3 rounded-xl font-bold transition-all shadow-lg shadow-slate-900/10 mt-2">Start Generating</button>
                 </div>
             </div>
          )}

          {isFormatModalOpen && (
             <div className="absolute inset-0 bg-slate-900/40 z-50 flex items-center justify-center p-4">
                 <div className="bg-white rounded-2xl shadow-xl w-full max-w-5xl h-[80vh] flex flex-col animate-in scale-95 duration-200">
                     <div className="p-6 border-b flex justify-between items-center">
                         <h2 className="font-bold text-xl">Select Formats</h2>
                         <button onClick={() => setIsFormatModalOpen(false)}><X /></button>
                     </div>
                     <div className="flex-1 overflow-y-auto p-6">
                         {Object.entries(FORMAT_GROUPS).map(([group, formats]) => (
                             <div key={group} className="mb-8">
                                 <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-4 border-b border-slate-100 pb-2">{group}</h3>
                                 <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                                     {formats.map(fmt => (
                                         <button
                                             key={fmt}
                                             onClick={() => toggleFormat(fmt)}
                                             className={`p-4 rounded-xl border text-left transition-all hover:shadow-md ${selectedFormats.has(fmt) ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200' : 'border-slate-200 bg-slate-50 hover:bg-white'}`}
                                         >
                                             <div className="text-sm font-bold text-slate-800">{fmt}</div>
                                         </button>
                                     ))}
                                 </div>
                             </div>
                         ))}
                     </div>
                     <div className="p-6 border-t bg-slate-50 flex justify-between items-center">
                         <button onClick={selectAll} className="text-slate-500 text-sm font-medium hover:text-slate-800">Select All</button>
                         <div className="flex items-center gap-4">
                             <div className="text-sm text-slate-500"><strong className="text-slate-900">{selectedFormats.size}</strong> formats selected</div>
                             <button onClick={handleConfirmGeneration} disabled={selectedFormats.size === 0} className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-lg shadow-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed">
                                 Generate Creatives
                             </button>
                         </div>
                     </div>
                 </div>
             </div>
          )}
        </main>
      </div>
    </HashRouter>
  );
};

export default App;
