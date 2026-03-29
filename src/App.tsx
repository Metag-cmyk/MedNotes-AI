import React, { useState, useRef, useEffect } from 'react';
import { generateNotesStream, generateVisualAid, beautifyNotesStream } from './services/geminiService';
import Markdown from 'react-markdown';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { FileText, Plus, Trash2, UploadCloud, BookOpen, Settings, Loader2, File as FileIcon, Folder, Download, ChevronDown, ChevronRight, FolderPlus } from 'lucide-react';

interface Topic {
  id: string;
  name: string;
}

interface Category {
  id: string;
  name: string;
  isExpanded: boolean;
  topics: Topic[];
}

interface ReferenceFile {
  name: string;
  mimeType: string;
  data: string; // base64
  size: number;
}

import { AIGeneratedImage } from './components/AIGeneratedImage';

export default function App() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);
  const [wordCount, setWordCount] = useState<number>(1000);
  const [files, setFiles] = useState<ReferenceFile[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPolishing, setIsPolishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newTopicNames, setNewTopicNames] = useState<Record<string, string>>({});
  const [uploadProgress, setUploadProgress] = useState<{fileName: string, progress: number, currentIndex: number, totalFiles: number} | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load from Local Storage
  useEffect(() => {
    const savedCategories = localStorage.getItem('mednotes_categories');
    const savedNotes = localStorage.getItem('mednotes_notes');
    
    if (savedCategories) {
      setCategories(JSON.parse(savedCategories));
    } else {
      setCategories([
        {
          id: 'cat-1',
          name: 'Cardiology',
          isExpanded: true,
          topics: [{ id: 'top-1', name: 'Cardiovascular Physiology' }]
        },
        {
          id: 'cat-2',
          name: 'Nephrology',
          isExpanded: true,
          topics: [{ id: 'top-2', name: 'Renal Pathology' }]
        }
      ]);
    }
    
    if (savedNotes) {
      setNotes(JSON.parse(savedNotes));
    }
    
    // Select first topic by default if none selected
    setIsLoaded(true);
  }, []);

  // Set default selection after load
  useEffect(() => {
    if (isLoaded && !selectedTopicId && categories.length > 0) {
      const firstCatWithTopics = categories.find(c => c.topics.length > 0);
      if (firstCatWithTopics) {
        setSelectedTopicId(firstCatWithTopics.topics[0].id);
      }
    }
  }, [isLoaded, categories, selectedTopicId]);

  // Save to Local Storage
  useEffect(() => {
    if (isLoaded) {
      localStorage.setItem('mednotes_categories', JSON.stringify(categories));
      localStorage.setItem('mednotes_notes', JSON.stringify(notes));
    }
  }, [categories, notes, isLoaded]);

  const handleAddCategory = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCategoryName.trim()) return;
    const newCat: Category = {
      id: `cat-${Date.now()}`,
      name: newCategoryName.trim(),
      isExpanded: true,
      topics: []
    };
    setCategories([...categories, newCat]);
    setNewCategoryName('');
  };

  const handleDeleteCategory = (catId: string) => {
    setCategories(categories.filter(c => c.id !== catId));
    const cat = categories.find(c => c.id === catId);
    if (cat && cat.topics.some(t => t.id === selectedTopicId)) {
      setSelectedTopicId(null);
    }
  };

  const handleAddTopic = (e: React.FormEvent, catId: string) => {
    e.preventDefault();
    const topicName = newTopicNames[catId]?.trim();
    if (!topicName) return;
    
    const newTopic: Topic = { id: `top-${Date.now()}`, name: topicName };
    setCategories(categories.map(c => {
      if (c.id === catId) {
        return { ...c, topics: [...c.topics, newTopic], isExpanded: true };
      }
      return c;
    }));
    
    setNewTopicNames({ ...newTopicNames, [catId]: '' });
    setSelectedTopicId(newTopic.id);
  };

  const handleDeleteTopic = (catId: string, topicId: string) => {
    setCategories(categories.map(c => {
      if (c.id === catId) {
        return { ...c, topics: c.topics.filter(t => t.id !== topicId) };
      }
      return c;
    }));
    if (selectedTopicId === topicId) setSelectedTopicId(null);
  };

  const toggleCategory = (catId: string) => {
    setCategories(categories.map(c => c.id === catId ? { ...c, isExpanded: !c.isExpanded } : c));
  };

  const getSelectedTopicName = () => {
    for (const cat of categories) {
      const topic = cat.topics.find(t => t.id === selectedTopicId);
      if (topic) return topic.name;
    }
    return null;
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFiles = e.target.files;
    if (!uploadedFiles) return;

    const newFiles: ReferenceFile[] = [];
    const totalFiles = uploadedFiles.length;
    for (let i = 0; i < totalFiles; i++) {
      const file = uploadedFiles[i];
      // Limit to 100MB
      if (file.size > 100 * 1024 * 1024) {
        alert(`File ${file.name} is too large. Max size is 100MB.`);
        continue;
      }
      
      try {
        setUploadProgress({ fileName: file.name, progress: 0, currentIndex: i + 1, totalFiles });
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const result = reader.result as string;
            // Extract base64 part
            const base64Data = result.split(',')[1];
            resolve(base64Data);
          };
          reader.onprogress = (event) => {
            if (event.lengthComputable) {
              const percentLoaded = Math.round((event.loaded / event.total) * 100);
              setUploadProgress({ fileName: file.name, progress: percentLoaded, currentIndex: i + 1, totalFiles });
            }
          };
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });

        newFiles.push({
          name: file.name,
          mimeType: file.type || 'application/octet-stream',
          data: base64,
          size: file.size,
        });
      } catch (err) {
        console.error(`Failed to read file ${file.name}`, err);
        alert(`Failed to read file ${file.name}`);
      }
    }

    setUploadProgress(null);
    setFiles(prev => [...prev, ...newFiles]);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleRemoveFile = (index: number) => {
    setFiles(files.filter((_, i) => i !== index));
  };

  const handleGenerateNotes = async () => {
    const topicName = getSelectedTopicName();
    if (!topicName || !selectedTopicId) return;
    
    setIsGenerating(true);
    setError(null);
    setNotes(prev => ({ ...prev, [selectedTopicId]: '' }));
    
    try {
      const stream = await generateNotesStream(topicName, wordCount, files);
      let generatedNotes = '';
      for await (const chunk of stream) {
        generatedNotes += chunk;
        setNotes(prev => ({
          ...prev,
          [selectedTopicId]: generatedNotes
        }));
      }
      
      setIsPolishing(true);
      const polishStream = await beautifyNotesStream(generatedNotes);
      let polishedNotes = '';
      for await (const chunk of polishStream) {
        polishedNotes += chunk;
        setNotes(prev => ({
          ...prev,
          [selectedTopicId]: polishedNotes
        }));
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'An error occurred while generating notes.');
    } finally {
      setIsGenerating(false);
      setIsPolishing(false);
    }
  };

  const handleExport = () => {
    if (!selectedTopicId || !notes[selectedTopicId]) return;
    const topicName = getSelectedTopicName() || 'Notes';
    const blob = new Blob([notes[selectedTopicId]], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${topicName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_notes.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const selectedTopicName = getSelectedTopicName();

  if (!isLoaded) return null;

  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-slate-50 text-slate-900 font-sans">
      {/* Sidebar */}
      <div className="w-full md:w-80 border-r border-b md:border-b-0 bg-white flex flex-col shadow-sm z-20 md:sticky md:top-0 md:h-screen">
        <div className="p-5 border-b bg-gradient-to-br from-slate-50 to-slate-100">
          <h1 className="text-xl font-bold flex items-center gap-2 text-slate-800">
            <div className="bg-blue-600 p-1.5 rounded-lg">
              <BookOpen className="h-5 w-5 text-white" />
            </div>
            MedNotes AI
          </h1>
          <p className="text-xs text-slate-500 mt-2 font-medium">Curriculum-based study builder</p>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="p-4 space-y-6">
            {/* Curriculum Section */}
            <section>
              <h2 className="text-sm font-semibold mb-3 flex items-center gap-2 uppercase tracking-wider text-slate-500">
                <Folder className="h-4 w-4" />
                Curriculum
              </h2>
              
              <form onSubmit={handleAddCategory} className="flex gap-2 mb-4">
                <Input 
                  placeholder="Add a new category..." 
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  className="h-9 text-sm bg-slate-50 border-slate-200 focus-visible:ring-blue-500"
                />
                <Button type="submit" size="sm" className="h-9 px-3 bg-slate-800 hover:bg-slate-700 text-white" disabled={!newCategoryName.trim()}>
                  <FolderPlus className="h-4 w-4" />
                </Button>
              </form>

              <div className="space-y-3">
                {categories.length === 0 ? (
                  <div className="text-center py-6 px-4 bg-slate-50 border border-dashed border-slate-200 rounded-xl">
                    <Folder className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                    <p className="text-sm text-slate-500 font-medium">No categories yet</p>
                    <p className="text-xs text-slate-400 mt-1">Add a category to start organizing your curriculum.</p>
                  </div>
                ) : (
                  categories.map(cat => (
                    <div key={cat.id} className="border rounded-md bg-white overflow-hidden shadow-sm">
                      <div 
                        className="flex items-center justify-between p-2 bg-slate-50 hover:bg-slate-100 cursor-pointer" 
                        onClick={() => toggleCategory(cat.id)}
                      >
                        <div className="flex items-center gap-2 font-medium text-sm text-slate-700">
                          {cat.isExpanded ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
                          <Folder className="h-4 w-4 text-blue-500" />
                          <span className="truncate max-w-[150px]">{cat.name}</span>
                        </div>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-6 w-6 text-slate-400 hover:text-red-500" 
                          onClick={(e) => { e.stopPropagation(); handleDeleteCategory(cat.id); }}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                      
                      {cat.isExpanded && (
                        <div className="p-2 border-t bg-white space-y-1">
                          {cat.topics.map(topic => (
                            <div 
                              key={topic.id}
                              className={`group flex items-center justify-between p-2 rounded-md cursor-pointer transition-colors text-sm ml-2 ${
                                selectedTopicId === topic.id 
                                  ? 'bg-blue-50 text-blue-700 font-medium' 
                                  : 'hover:bg-slate-50 text-slate-600'
                              }`}
                              onClick={() => setSelectedTopicId(topic.id)}
                            >
                              <div className="flex items-center gap-2 truncate">
                                <FileText className="h-3 w-3 opacity-50 flex-shrink-0" />
                                <span className="truncate">{topic.name}</span>
                              </div>
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-slate-400 hover:text-red-500 flex-shrink-0" 
                                onClick={(e) => { e.stopPropagation(); handleDeleteTopic(cat.id, topic.id); }}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          ))}
                          
                          <form onSubmit={(e) => handleAddTopic(e, cat.id)} className="flex gap-2 mt-3 ml-2">
                            <Input 
                              placeholder="Add a topic..." 
                              value={newTopicNames[cat.id] || ''} 
                              onChange={e => setNewTopicNames({...newTopicNames, [cat.id]: e.target.value})} 
                              className="h-8 text-xs bg-slate-50 border-slate-200 focus-visible:ring-blue-500" 
                            />
                            <Button type="submit" size="sm" variant="secondary" className="h-8 px-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600" disabled={!(newTopicNames[cat.id]?.trim())}>
                              <Plus className="h-3.5 w-3.5" />
                            </Button>
                          </form>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </section>

            <Separator />

            {/* Reference Materials Section */}
            <section>
              <h2 className="text-sm font-semibold mb-3 flex items-center gap-2 uppercase tracking-wider text-slate-500">
                <BookOpen className="h-4 w-4" />
                Reference Materials
              </h2>
              
              <div 
                className={`border-2 border-dashed border-slate-300 rounded-xl p-5 text-center transition-all mb-3 ${uploadProgress ? 'opacity-50 cursor-not-allowed bg-slate-50' : 'hover:bg-blue-50 hover:border-blue-300 cursor-pointer bg-white'}`}
                onClick={() => !uploadProgress && fileInputRef.current?.click()}
              >
                <div className="bg-slate-100 w-10 h-10 rounded-full flex items-center justify-center mx-auto mb-3">
                  <UploadCloud className="h-5 w-5 text-slate-500" />
                </div>
                <p className="text-xs font-medium text-slate-600">Click to upload textbooks or papers</p>
                <p className="text-[10px] text-slate-400 mt-1.5">PDF, TXT, MD, CSV (Max 100MB)</p>
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  className="hidden" 
                  multiple 
                  accept=".pdf,.txt,.md,.csv"
                  onChange={handleFileUpload}
                  disabled={uploadProgress !== null}
                />
              </div>

              {uploadProgress && (
                <div className="mb-3 p-3 bg-blue-50 border border-blue-100 rounded-md">
                  <div className="flex justify-between text-xs text-blue-700 mb-1">
                    <span className="truncate pr-2 font-medium">
                      {uploadProgress.totalFiles > 1 ? `Uploading ${uploadProgress.currentIndex} of ${uploadProgress.totalFiles}: ` : 'Uploading: '}
                      {uploadProgress.fileName}
                    </span>
                    <span>{uploadProgress.progress}%</span>
                  </div>
                  <div className="w-full bg-blue-200 rounded-full h-1.5 overflow-hidden">
                    <div 
                      className="bg-blue-600 h-1.5 rounded-full transition-all duration-300 ease-out" 
                      style={{ width: `${uploadProgress.progress}%` }}
                    ></div>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                {files.map((file, index) => (
                  <div key={index} className="flex items-center justify-between bg-slate-50 p-2 rounded border text-xs">
                    <div className="flex items-center gap-2 overflow-hidden">
                      <FileIcon className="h-3 w-3 text-slate-400 flex-shrink-0" />
                      <span className="truncate text-slate-600">{file.name}</span>
                    </div>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-5 w-5 text-slate-400 hover:text-red-500 flex-shrink-0"
                      onClick={() => handleRemoveFile(index)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            </section>

            <Separator />

            {/* Settings Section */}
            <section className="pb-6">
              <h2 className="text-sm font-semibold mb-3 flex items-center gap-2 uppercase tracking-wider text-slate-500">
                <Settings className="h-4 w-4" />
                Generation Settings
              </h2>
              
              <div className="space-y-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <label className="text-xs font-medium text-slate-700">Target Word Count</label>
                    <Badge variant="secondary" className="text-[10px] bg-white border-slate-200">{wordCount} words</Badge>
                  </div>
                  <Slider 
                    value={[wordCount]} 
                    onValueChange={(val) => setWordCount(val[0])} 
                    max={5000} 
                    min={200} 
                    step={100} 
                    className="py-2"
                  />
                  <p className="text-[10px] text-slate-500 leading-relaxed">
                    Adjust the depth of the generated notes. Longer word counts will include more detail and examples.
                  </p>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col bg-slate-50/50 min-w-0">
        {selectedTopicId && selectedTopicName ? (
          <>
            <div className="p-6 border-b bg-white/80 backdrop-blur-md flex flex-col sm:flex-row items-start sm:items-center justify-between shadow-sm sticky top-0 z-10 gap-4 sm:gap-0">
              <div>
                <h2 className="text-2xl font-bold text-slate-800 flex items-center">
                  {selectedTopicName}
                  {isPolishing && (
                    <Badge variant="secondary" className="ml-3 bg-blue-100 text-blue-700 hover:bg-blue-100 border-blue-200 shadow-sm">
                      <Loader2 className="h-3 w-3 animate-spin mr-1" />
                      Polishing...
                    </Badge>
                  )}
                </h2>
                <p className="text-sm text-slate-500 mt-1 flex items-center gap-1.5">
                  {notes[selectedTopicId] ? (
                    <><span className="w-2 h-2 rounded-full bg-green-500"></span> Notes generated</>
                  ) : (
                    <><span className="w-2 h-2 rounded-full bg-amber-400"></span> Ready to generate notes</>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-3">
                {notes[selectedTopicId] && !isGenerating && !isPolishing && (
                  <Button 
                    variant="outline" 
                    onClick={handleExport}
                    className="shadow-sm"
                  >
                    <Download className="mr-2 h-4 w-4" />
                    Export Markdown
                  </Button>
                )}
                <Button 
                  onClick={handleGenerateNotes} 
                  disabled={isGenerating || isPolishing}
                  className="bg-blue-600 hover:bg-blue-700 text-white shadow-md transition-all hover:shadow-lg font-medium px-5"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Generating...
                    </>
                  ) : isPolishing ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Polishing...
                    </>
                  ) : (
                    <>
                      <FileText className="mr-2 h-4 w-4" />
                      {notes[selectedTopicId] ? 'Rebuild Notes' : 'Build Notes'}
                    </>
                  )}
                </Button>
              </div>
            </div>

            <div className="flex-1 p-4 sm:p-6 overflow-x-hidden">
              <div className="max-w-4xl mx-auto">
                {error && (
                  <div className="bg-red-50 text-red-600 p-4 rounded-md mb-6 border border-red-100 text-sm">
                    <strong>Error:</strong> {(error.includes('429') || error.includes('RESOURCE_EXHAUSTED') || error.includes('quota')) 
                      ? 'API quota exceeded. Please check your plan or try again later.' 
                      : error}
                  </div>
                )}

                {notes[selectedTopicId] ? (
                  <Card className="shadow-sm border-slate-200 overflow-hidden">
                    <CardContent className="p-8 sm:p-12 prose prose-slate max-w-none prose-headings:text-slate-800 prose-headings:font-semibold prose-a:text-blue-600 hover:prose-a:text-blue-500 prose-img:rounded-xl prose-img:shadow-md prose-hr:border-slate-200">
                      <div className="markdown-body">
                        <Markdown
                          urlTransform={(value: string) => value}
                          components={{
                            img: ({node, ...props}) => {
                              const { src, ...rest } = props;
                              if (src?.startsWith('generate-image://')) {
                                let prompt = src.replace('generate-image://', '').replace(/_/g, ' ');
                                if (props.title) {
                                  prompt += ' ' + props.title;
                                }
                                return <AIGeneratedImage prompt={prompt} alt={props.alt} />;
                              }
                              return <img {...rest} src={src || undefined} className="rounded-lg shadow-sm max-w-full h-auto" />;
                            }
                          }}
                        >
                          {notes[selectedTopicId]}
                        </Markdown>
                      </div>
                    </CardContent>
                  </Card>
                ) : isGenerating ? (
                  <div className="flex flex-col items-center justify-center py-32 text-slate-400">
                    <div className="relative mb-6">
                      <div className="absolute inset-0 bg-blue-100 rounded-full blur-xl opacity-50 animate-pulse"></div>
                      <Loader2 className="h-12 w-12 animate-spin text-blue-600 relative z-10" />
                    </div>
                    <p className="text-xl font-medium text-slate-700">Synthesizing medical literature...</p>
                    <p className="text-sm mt-2 text-slate-500">Reading {files.length} reference files and searching the web.</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-32 text-slate-400 text-center bg-white rounded-xl border border-dashed border-slate-300 shadow-sm">
                    <div className="bg-slate-50 p-4 rounded-full mb-4">
                      <BookOpen className="h-10 w-10 text-slate-400" />
                    </div>
                    <h3 className="text-xl font-medium text-slate-700 mb-2">No notes generated yet</h3>
                    <p className="max-w-md text-sm text-slate-500 mb-6">
                      Click "Build Notes" to generate comprehensive study materials based on your curriculum topic and uploaded reference materials.
                    </p>
                    <Button 
                      onClick={handleGenerateNotes} 
                      className="bg-blue-600 hover:bg-blue-700 text-white shadow-md transition-all hover:shadow-lg font-medium px-6 py-5 rounded-full"
                    >
                      <FileText className="mr-2 h-5 w-5" />
                      Build Notes Now
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center bg-slate-50/50 p-10">
            <div className="text-center max-w-md">
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 inline-block mb-6">
                <FileText className="h-12 w-12 text-blue-500" />
              </div>
              <h2 className="text-2xl font-bold text-slate-800 mb-2">Welcome to MedNotes AI</h2>
              <p className="text-slate-500">Select a topic from the sidebar or create a new one to start building your personalized medical curriculum.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
