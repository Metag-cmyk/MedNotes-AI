import React, { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { generateVisualAid } from '../services/geminiService';

const imageCache = new Map<string, string>();

export const AIGeneratedImage = ({ prompt, alt }: { prompt: string, alt?: string }) => {
  const [imgSrc, setImgSrc] = useState<string | null>(imageCache.get(prompt) || null);
  const [loading, setLoading] = useState(!imageCache.has(prompt));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (imgSrc) return;
    let isMounted = true;
    
    generateVisualAid(prompt)
      .then(src => {
        if (isMounted) {
          imageCache.set(prompt, src);
          setImgSrc(src);
          setLoading(false);
        }
      })
      .catch(err => {
        console.error("Failed to generate image", err);
        if (isMounted) {
          setError(err.message || "Unknown error");
          setLoading(false);
        }
      });
      
    return () => { isMounted = false; };
  }, [prompt, imgSrc]);

  if (loading) {
    return (
      <span className="flex flex-col items-center justify-center p-8 border-2 border-dashed border-slate-200 rounded-lg bg-slate-50 my-6">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500 mb-2" />
        <span className="text-sm text-slate-500">Generating visual aid: {alt || 'Image'}...</span>
      </span>
    );
  }

  if (error || !imgSrc) {
    const isQuotaError = error && (error.includes('429') || error.includes('RESOURCE_EXHAUSTED') || error.includes('quota'));
    return (
      <span className="flex flex-col items-center justify-center p-8 border-2 border-dashed border-red-200 rounded-lg bg-red-50 my-6 text-red-500">
        <span className="text-sm font-medium">Failed to generate visual aid: {alt}</span>
        {isQuotaError && (
          <span className="text-xs mt-2 text-red-400 text-center max-w-md block">
            Image generation quota exceeded. Please try again later.
          </span>
        )}
      </span>
    );
  }

  return (
    <span className="block my-8">
      <img src={imgSrc} alt={alt || 'AI Generated Visual Aid'} className="rounded-lg shadow-md max-w-full h-auto mx-auto block" />
      {alt && <span className="block text-center text-sm text-slate-500 mt-2">{alt}</span>}
    </span>
  );
};
